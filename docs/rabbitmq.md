# RabbitMQ

Documentação de referência sobre os conceitos fundamentais do RabbitMQ, usada como apoio para o código deste projeto (`src/`).

## Índice

- [O que é RabbitMQ](#o-que-é-rabbitmq)
- [Connection](#connection)
- [Channel](#channel)
- [Queue](#queue)
- [Producer](#producer)
- [Consumer](#consumer)
- [Exchange](#exchange)
- [Binding](#binding)
- [Routing Key](#routing-key)
- [Ack, Nack e Reject](#ack-nack-e-reject)
- [Dead Letter Queue (DLQ)](#dead-letter-queue-dlq)
- [Outros conceitos importantes](#outros-conceitos-importantes)
- [Fluxo completo (resumo)](#fluxo-completo-resumo)

---

## O que é RabbitMQ

RabbitMQ é um **message broker** (intermediário de mensagens): um serviço que recebe mensagens de quem produz (producers) e as entrega para quem consome (consumers), desacoplando esses dois lados.

Em vez de o serviço A chamar diretamente o serviço B (como em uma requisição HTTP síncrona), o serviço A envia uma mensagem para o RabbitMQ, e o RabbitMQ garante a entrega dessa mensagem para quem estiver interessado nela. Isso traz benefícios como:

- **Desacoplamento**: producer e consumer não precisam se conhecer nem estar disponíveis ao mesmo tempo.
- **Resiliência**: se o consumer cair, a mensagem fica guardada na fila até ele voltar.
- **Escalabilidade**: é possível ter vários consumers processando mensagens em paralelo.
- **Assincronismo**: o producer não precisa esperar o processamento terminar para continuar seu trabalho.

O RabbitMQ implementa o protocolo **AMQP** (Advanced Message Queuing Protocol), que é o protocolo usado pela lib deste projeto, [`amqplib`](https://www.npmjs.com/package/amqplib).

No `docker-compose.yaml` deste projeto, o RabbitMQ sobe com o plugin de management habilitado (imagem `rabbitmq:4.1.0-management`), expondo:

- `5672`: porta do protocolo AMQP (usada pela aplicação para conectar).
- `15672`: interface web de administração (`http://localhost:15672`), útil para inspecionar filas, exchanges e mensagens visualmente.

---

## Connection

A **connection** é a conexão TCP entre a aplicação e o servidor RabbitMQ. É o primeiro passo para qualquer comunicação:

```ts
import amqp from "amqplib";

const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
```

Abrir e fechar conexões é uma operação relativamente cara (handshake TCP + autenticação). Por isso, o normal é abrir **uma connection por aplicação** (ou por processo) e reaproveitá-la, criando vários *channels* a partir dela em vez de várias conexões.

Ao final do uso, a connection deve ser encerrada com `connection.close()`.

---

## Channel

Um **channel** é um canal de comunicação virtual, criado dentro de uma connection, por onde as operações realmente acontecem (declarar filas, publicar mensagens, consumir, etc.):

```ts
const channel = await connection.createChannel();
```

Por que não usar a connection diretamente? Porque abrir múltiplas connections TCP é custoso. O channel resolve isso multiplexando várias "linhas lógicas" de comunicação dentro de uma única conexão TCP, cada uma isolada da outra.

Boas práticas:

- Uma connection pode ter **vários channels**.
- Channels **não são thread-safe** — em aplicações concorrentes, use um channel por thread/worker.
- Se um erro ocorre em um channel, ele é fechado, mas a connection continua válida e outros channels não são afetados.

É no channel que se declaram filas e exchanges, se configuram bindings, e se publica/consome mensagens.

---

## Queue

A **queue** (fila) é onde as mensagens ficam efetivamente armazenadas até serem consumidas. É uma estrutura FIFO (com particularidades, como prioridade e mensagens redirecionadas).

```ts
await channel.assertQueue("orders", { durable: true });
```

Principais opções:

- `durable`: se `true`, a fila sobrevive a um restart do RabbitMQ (a fila em si é persistida em disco; para as mensagens também sobreviverem, é preciso publicá-las com `persistent: true`).
- `exclusive`: fila usada por apenas uma connection, removida quando ela fecha (útil para filas temporárias de reply/callback).
- `autoDelete`: a fila é removida automaticamente quando o último consumer se desconecta.
- `arguments`: configurações extras, como TTL de mensagem, tamanho máximo, e a **dead letter exchange** (ver adiante).

---

## Producer

**Producer** é o papel de quem **publica** mensagens. Não é uma entidade especial no RabbitMQ — é simplesmente qualquer aplicação/código que chama `channel.publish(...)` ou `channel.sendToQueue(...)`.

```ts
channel.sendToQueue("orders", Buffer.from(JSON.stringify({ id: 1 })), {
    persistent: true,
});
```

Um ponto importante: **o producer nunca envia diretamente para uma queue** (mesmo o `sendToQueue` é, por baixo dos panos, um atalho que publica na *exchange padrão* usando o nome da fila como routing key). Na prática, o producer sempre publica em uma **exchange**, e é a exchange quem decide para quais filas a mensagem vai.

---

## Consumer

**Consumer** é o papel de quem **lê e processa** as mensagens de uma fila.

```ts
await channel.consume("orders", (msg) => {
    if (msg) {
        console.log("Mensagem recebida:", msg.content.toString());
        channel.ack(msg);
    }
});
```

Pontos importantes:

- Um consumer se inscreve em uma **fila** (não em uma exchange).
- Várias instâncias de um mesmo consumer podem consumir da mesma fila — o RabbitMQ distribui as mensagens entre elas (padrão *competing consumers*, útil para escalar processamento horizontalmente).
- `channel.prefetch(n)` limita quantas mensagens não confirmadas (unacked) um consumer pode receber por vez, evitando sobrecarregá-lo.
- O consumer deve confirmar o processamento da mensagem (ver [Ack, Nack e Reject](#ack-nack-e-reject)).

---

## Exchange

A **exchange** é o componente que recebe as mensagens dos producers e decide para quais filas encaminhá-las, com base em regras de roteamento (bindings) e no seu **tipo**.

```ts
await channel.assertExchange("orders.exchange", "direct", { durable: true });
```

Tipos de exchange:

| Tipo | Comportamento |
|---|---|
| `direct` | Encaminha a mensagem para as filas cuja binding key seja **exatamente igual** à routing key da mensagem. Ideal para roteamento pontual (ex.: `order.created`, `order.cancelled`). |
| `fanout` | Ignora a routing key e encaminha a mensagem para **todas** as filas vinculadas a ela. Ideal para broadcast (ex.: notificar vários serviços do mesmo evento). |
| `topic` | Encaminha com base em **padrões** na routing key, usando `*` (um termo) e `#` (zero ou mais termos) separados por `.` (ex.: `order.*.created`, `order.#`). Mais flexível que o `direct`. |
| `headers` | Ignora a routing key e roteia com base em **atributos (headers)** da mensagem, comparados com os argumentos do binding. Menos comum. |

Existe também a **exchange padrão (default exchange)**, do tipo `direct` e sem nome (`""`), na qual toda fila é automaticamente vinculada usando seu próprio nome como binding key — é o que o `channel.sendToQueue()` usa por baixo dos panos.

---

## Binding

**Binding** é a "ligação"/regra que conecta uma **exchange** a uma **queue** (ou até exchange a exchange), definindo em que condição uma mensagem que chega na exchange deve ser copiada para aquela fila.

```ts
await channel.bindQueue("orders.queue", "orders.exchange", "order.created");
```

Nesse exemplo, a fila `orders.queue` receberá as mensagens publicadas na exchange `orders.exchange` cuja routing key seja `order.created` (assumindo uma exchange do tipo `direct` ou `topic`).

Uma mesma fila pode ter múltiplos bindings (para exchanges diferentes ou routing keys diferentes), e uma mesma exchange pode ter várias filas vinculadas — nesse caso, a mensagem é copiada para todas as que "casarem" com a regra.

---

## Routing Key

A **routing key** é um rótulo (string) enviado junto com a mensagem no momento da publicação, usado pela exchange para decidir o roteamento:

```ts
channel.publish("orders.exchange", "order.created", Buffer.from(JSON.stringify({ id: 1 })));
```

Seu significado depende do tipo de exchange:

- Em `direct`, precisa bater exatamente com a binding key.
- Em `topic`, é comparada por padrão (`order.*`, `order.#`).
- Em `fanout` e `headers`, é ignorada.

---

## Ack, Nack e Reject

Por padrão, o RabbitMQ opera em modo de **confirmação manual (manual ack)**: uma mensagem entregue a um consumer só é removida da fila quando ele confirma o processamento. Isso garante que, se o consumer cair no meio do processamento, a mensagem não se perde — ela volta para a fila.

- `channel.ack(msg)`: confirma que a mensagem foi processada com sucesso; ela é removida da fila.
- `channel.nack(msg, allUpTo, requeue)`: rejeita a mensagem, indicando falha no processamento. Se `requeue` for `true`, a mensagem volta para a fila (ou é reenviada); se `false`, ela é descartada — ou enviada para uma **dead letter queue**, se configurada.
- `channel.reject(msg, requeue)`: similar ao `nack`, mas rejeita uma única mensagem por vez (sem o parâmetro `allUpTo`).

Também é possível consumir em modo `noAck: true` (auto-ack), em que o RabbitMQ considera a mensagem entregue assim que ela sai da fila — mais rápido, porém arriscado, pois uma falha do consumer resulta em perda da mensagem.

---

## Dead Letter Queue (DLQ)

Uma **Dead Letter Queue** é uma fila "de segundo plano" para onde vão mensagens que não puderam ser processadas normalmente. Uma mensagem se torna "morta" (dead-lettered) quando:

1. É rejeitada com `nack`/`reject` e `requeue: false`.
2. Expira por TTL (`x-message-ttl` ou TTL individual da mensagem).
3. A fila atinge seu limite máximo (`x-max-length`) e a mensagem mais antiga é descartada.

A configuração é feita através de uma **Dead Letter Exchange (DLX)** associada à fila original — quando uma mensagem "morre", o RabbitMQ a republica automaticamente nessa exchange:

```ts
// Exchange e fila de dead letter
await channel.assertExchange("orders.dlx", "fanout", { durable: true });
await channel.assertQueue("orders.dlq", { durable: true });
await channel.bindQueue("orders.dlq", "orders.dlx", "");

// Fila original, apontando para a DLX
await channel.assertQueue("orders.queue", {
    durable: true,
    arguments: {
        "x-dead-letter-exchange": "orders.dlx",
    },
});
```

A DLQ é útil para:

- Evitar perda de mensagens problemáticas (em vez de descartá-las silenciosamente).
- Permitir inspeção manual e reprocessamento posterior (retry).
- Implementar padrões de retry com atraso, combinando DLX com TTL (a chamada técnica de "fila de retry" ou "parking lot").

---

## Outros conceitos importantes

- **Prefetch (QoS)**: `channel.prefetch(n)` limita quantas mensagens sem `ack` um consumer pode ter simultaneamente, evitando que ele receba mais trabalho do que consegue processar.
- **Durability vs Persistence**: `durable` (na fila/exchange) garante que a *estrutura* sobreviva a um restart do broker; `persistent: true` (na mensagem) garante que a *mensagem* seja escrita em disco. Os dois são necessários para não perder dados em caso de falha do RabbitMQ.
- **Publisher confirms**: mecanismo (`channel.waitForConfirms()` / modo confirm channel) para o producer ter certeza de que a mensagem foi de fato recebida pelo broker, não apenas enviada pela rede.
- **TTL (Time To Live)**: tempo de vida de uma mensagem (ou de uma fila inteira), após o qual ela expira e pode ser dead-lettered.
- **Virtual Hosts (vhosts)**: forma de isolar grupos de exchanges/filas/usuários dentro do mesmo servidor RabbitMQ, como um "namespace" (útil para separar ambientes ou times).
- **Management UI**: em `http://localhost:15672` (login `admin`/`admin` neste projeto), permite visualizar filas, exchanges, bindings, taxas de mensagens e até publicar/consumir mensagens manualmente para debug.

---

## Fluxo completo (resumo)

```
Producer
   │  channel.publish(exchange, routingKey, message)
   ▼
Exchange (direct | fanout | topic | headers)
   │  roteamento via Binding (routing key / binding key)
   ▼
Queue
   │  channel.consume(queue, callback)
   ▼
Consumer
   │  channel.ack(msg) ─── sucesso, mensagem removida
   └─ channel.nack(msg, false, false) ─── falha, mensagem descartada ou enviada para a Dead Letter Exchange
                                              ▼
                                        Dead Letter Queue
```

Tudo isso acontece sobre um **channel**, que por sua vez existe dentro de uma **connection** entre a aplicação e o servidor RabbitMQ.
