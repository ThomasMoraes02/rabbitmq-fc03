# RabbitMQ Playground

Projeto de estudo com exemplos práticos, em TypeScript, dos principais conceitos e padrões de mensageria com **RabbitMQ** usando a lib [`amqplib`](https://www.npmjs.com/package/amqplib). Cada pasta em `src/` isola um conceito (fila simples, work queue, fanout, direct, topic exchange...) com producers e consumers executáveis de forma independente.

> Documentação conceitual completa (com exemplos de código para cada tópico) em [`docs/rabbitmq.md`](docs/rabbitmq.md).

## Índice

- [O que é mensageria](#o-que-é-mensageria)
- [O que é o RabbitMQ](#o-que-é-o-rabbitmq)
- [Quando usar mensageria](#quando-usar-mensageria)
- [Conceitos principais](#conceitos-principais)
- [Pré-requisitos](#pré-requisitos)
- [Como rodar](#como-rodar)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Management UI](#management-ui)

## O que é mensageria

**Mensageria** (messaging) é um estilo de comunicação entre sistemas em que, em vez de um serviço chamar outro diretamente (como numa requisição HTTP síncrona), ele envia uma **mensagem** para um intermediário — o **message broker** — que garante a entrega dessa mensagem para quem estiver interessado nela.

Isso desacopla quem produz a informação de quem a consome: o produtor não precisa saber quem vai processar a mensagem, nem esperar essa resposta, nem que o consumidor esteja disponível no mesmo instante.

## O que é o RabbitMQ

**RabbitMQ** é um message broker open source que implementa o protocolo **AMQP** (Advanced Message Queuing Protocol). Ele recebe mensagens de **producers**, aplica regras de roteamento através de **exchanges** e **bindings**, armazena as mensagens em **queues** e as entrega para **consumers**.

```
Producer ──▶ Exchange ──(binding/routing key)──▶ Queue ──▶ Consumer
```

Neste projeto, o RabbitMQ roda via Docker (`docker-compose.yaml`), com a imagem `rabbitmq:4.1.0-management`, expondo:

- **`5672`** — porta AMQP, usada pela aplicação para conectar.
- **`15672`** — interface web de administração ([Management UI](#management-ui)).

## Quando usar mensageria

Mensageria não substitui toda chamada HTTP — ela resolve bem problemas específicos:

| Cenário | Por quê |
|---|---|
| Processamento assíncrono/demorado (envio de e-mail, geração de relatório, processamento de imagem) | O producer não precisa esperar o processamento terminar para responder ao usuário |
| Picos de carga | A fila absorve o excesso de mensagens; os consumers processam no próprio ritmo (buffer/backpressure) |
| Múltiplos serviços reagindo ao mesmo evento | Um evento (`order.created`) pode notificar pagamento, estoque e e-mail sem acoplar esses serviços entre si |
| Resiliência a falhas temporárias | Se o consumer cair, a mensagem permanece na fila até ele voltar |
| Escalar processamento horizontalmente | Várias instâncias do mesmo consumer competem pelas mensagens de uma fila (*competing consumers*) |

Quando a resposta precisa ser imediata e síncrona para quem chamou (ex.: `GET /users/1`), uma chamada HTTP/RPC direta continua sendo mais simples e adequada.

## Conceitos principais

Resumo rápido — detalhes e exemplos de código em [`docs/rabbitmq.md`](docs/rabbitmq.md).

- **Connection** — conexão TCP entre a aplicação e o RabbitMQ. Cara de abrir/fechar; em geral, uma por aplicação.
- **Channel** — canal virtual dentro de uma connection, por onde as operações (declarar fila, publicar, consumir) realmente acontecem. Evita abrir várias connections TCP.
- **Queue** — estrutura (essencialmente FIFO) onde as mensagens ficam armazenadas até serem consumidas.
- **Exchange** — recebe as mensagens do producer e decide para quais filas encaminhá-las, com base no seu tipo e nos bindings configurados. O producer **nunca** publica direto numa fila, sempre numa exchange.
  - `direct` — entrega para filas cuja binding key seja **exatamente igual** à routing key.
  - `fanout` — ignora a routing key, entrega para **todas** as filas vinculadas (broadcast).
  - `topic` — entrega com base em **padrões** na routing key (`*` = um termo, `#` = zero ou mais termos), ex.: `order.#`.
  - `headers` — roteia por atributos da mensagem em vez de routing key (menos comum).
- **Binding** — a regra que liga uma exchange a uma fila (ex.: "encaminhe para esta fila quando a routing key for `order.created`").
- **Routing Key** — rótulo enviado junto com a mensagem, usado pela exchange para decidir o roteamento (seu significado varia por tipo de exchange).
- **Producer** — quem publica mensagens (`channel.publish(...)`).
- **Consumer** — quem lê e processa mensagens de uma fila (`channel.consume(...)`).
- **Ack / Nack / Reject** — confirmação manual de que uma mensagem foi processada (`ack`) ou falhou (`nack`/`reject`, podendo voltar para a fila ou ir para uma dead letter queue).

## Pré-requisitos

- [Docker](https://www.docker.com/) e Docker Compose
- [Node.js](https://nodejs.org/) (versão compatível com as `devDependencies` do projeto)

## Como rodar

1. Suba o RabbitMQ:

   ```bash
   docker-compose up -d
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Rode qualquer exemplo com `tsx` (não é necessário compilar):

   ```bash
   npx tsx src/09-exchange-topic/producer-order.ts
   npx tsx src/09-exchange-topic/consumer-nfe.ts
   ```

   Consumers ficam escutando indefinidamente (`Ctrl+C` para encerrar); producers publicam e encerram sozinhos.

   Para exemplos com múltiplos consumers/producer (ex.: `07-exchange-direct`, `08-exchange-fanout`, `09-exchange-topic`), rode cada consumer em um terminal separado **antes** de rodar o producer, já que as filas usadas não são duráveis nem persistem mensagens publicadas sem consumer ligado.

Credenciais do broker (definidas em `docker-compose.yaml`): usuário `admin`, senha `admin`, host `localhost:5672`.

## Estrutura do projeto

| Diretório | Conceito | Descrição |
|---|---|---|
| [`src/01-connection`](src/01-connection) | Connection / Channel | Abrir conexão e channel, e encerrá-los corretamente. |
| [`src/02-consumer-producer`](src/02-consumer-producer) | Queue básica | Producer/consumer simples usando a exchange padrão (`sendToQueue`). |
| [`src/04-multiplos-consumidores`](src/04-multiplos-consumidores) | Competing consumers | Várias instâncias de consumer dividindo o processamento de uma mesma fila. |
| [`src/05-pub-sub-fanout-exchange`](src/05-pub-sub-fanout-exchange) | Fanout (intro) | Primeiro contato com exchange fanout e publish/subscribe. |
| [`src/06-work-queue`](src/06-work-queue) | Work Queue | `prefetch(1)` + ack manual para distribuir tarefas de forma justa entre workers. |
| [`src/07-exchange-direct`](src/07-exchange-direct) | Direct Exchange | Roteamento por igualdade exata de routing key. Ver [`about.md`](src/07-exchange-direct/about.md). |
| [`src/08-exchange-fanout`](src/08-exchange-fanout) | Fanout Exchange | Broadcast do mesmo evento para múltiplos consumers independentes. Ver [`about.md`](src/08-exchange-fanout/about.md). |
| [`src/09-exchange-topic`](src/09-exchange-topic) | Topic Exchange | Roteamento por padrões (`*`/`#`) na routing key. Ver [`about.md`](src/09-exchange-topic/about.md). |

## Management UI

Com o container rodando, acesse [http://localhost:15672](http://localhost:15672) (login `admin` / `admin`) para inspecionar exchanges, filas, bindings e taxas de mensagens, além de publicar/consumir mensagens manualmente para debug.
