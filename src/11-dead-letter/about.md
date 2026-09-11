# Dead Letter Exchange (DLX)

Um **dead letter exchange** é uma exchange comum do RabbitMQ (`direct`, `fanout` ou `topic`) que recebe mensagens que uma fila **não conseguiu entregar normalmente** — chamadas de "mensagens mortas" (dead letters). Não é um tipo especial de exchange: é a mesma exchange de sempre, só que configurada como destino de "descarte" de outra fila.

## Quando usar

Quando você precisa garantir que uma mensagem problemática não seja perdida nem fique travando a fila principal indefinidamente: pedidos com dados inválidos, mensagens que excederam o número de tentativas de processamento, mensagens que expiraram sem ser consumidas, ou uma fila que atingiu um limite de tamanho. Em vez de simplesmente descartar (`ack`) ou reprocessar pra sempre (`requeue`), a mensagem é redirecionada para uma exchange separada, de onde outro consumer (ou um humano) pode inspecioná-la, alertar, ou tentar novamente mais tarde.

## Como uma mensagem vira "dead letter"

Uma mensagem é roteada para a DLX quando a fila original é declarada com o argumento `x-dead-letter-exchange` (`deadLetterExchange` no amqplib) e acontece um destes três casos:

| Motivo (`x-death.reason`) | Como acontece |
|---|---|
| **`rejected`** | `channel.nack(msg, false, false)` ou `channel.reject(msg, false)` — o consumer sinaliza falha e pede para **não** recolocar na fila original |
| **`expired`** | Mensagem ou fila configurada com `x-message-ttl` (`messageTtl`) e ninguém consumiu a tempo |
| **`maxlen`** | Fila com `x-max-length` (`maxLength`) atingiu o limite e a mensagem mais antiga é descartada |

Este exemplo cobre o primeiro caso (rejeição), que é o mais comum na prática — falha de validação/processamento.

## Funcionamento

```
Producer
   │  channel.publish("orders-exchange", "order.created", message)
   ▼
orders-exchange (direct)
   │  routing key "order.created"
   ▼
orders-queue   (arguments: { deadLetterExchange: "orders-dlx" })
   │
   ├─ consumer processa com sucesso ──► channel.ack(msg)         (mensagem sai da fila, fim)
   │
   └─ consumer rejeita (dado inválido) ──► channel.nack(msg, false, false)
          │
          ▼
     orders-dlx (fanout)
          │
          ▼
     orders-dlq ──► consumer-dead-letter.ts (loga o motivo via header x-death)
```

- A DLX é uma exchange normal: precisa ter uma fila vinculada a ela (`bindQueue`), senão as mensagens mortas se perdem igual em qualquer outra exchange sem fila.
- O RabbitMQ adiciona automaticamente um header `x-death` à mensagem morta, com o motivo, a fila de origem e quantas vezes isso já aconteceu.
- É possível encadear: a própria DLQ pode ter uma dead-letter-exchange, criando um padrão de retry com múltiplas tentativas (não coberto neste exemplo).

## Exemplo de uso

Neste diretório, `producer-order.ts` publica 5 pedidos na exchange `orders-exchange`, dois deles com `product` vazio (simulando dado inválido):

```ts
const orders = [
    { id: 1, product: "Notebook" },
    { id: 2, product: "" },   // inválido
    { id: 3, product: "Mouse" },
    { id: 4, product: "" },   // inválido
    { id: 5, product: "Teclado" },
];
```

`consumer-order.ts` declara a fila principal já apontando para a dead-letter-exchange:

```ts
await channel.assertExchange(DLX, "fanout");
await channel.assertQueue(QUEUE, {
    deadLetterExchange: DLX,
});
```

E rejeita definitivamente os pedidos inválidos:

```ts
if (!order.product) {
    channel.nack(msg, false, false); // requeue:false -> vai para a DLX
    return;
}
channel.ack(msg);
```

`consumer-dead-letter.ts` fica ouvindo a `orders-dlq` e mostra o motivo da rejeição, lido do header `x-death`:

```ts
const death = msg.properties.headers?.["x-death"]?.[0];
console.log(`motivo: ${death.reason} | fila original: ${death.queue} | tentativas: ${death.count}`);
```

### Rodando o exemplo

Em três terminais separados, nesta ordem (as filas não são duráveis, então os consumers precisam estar de pé antes do producer):

```bash
npx tsx src/11-dead-letter/consumer-dead-letter.ts
npx tsx src/11-dead-letter/consumer-order.ts
npx tsx src/11-dead-letter/producer-order.ts
```

Os pedidos `#2` e `#4` (produto vazio) aparecem no terminal do `consumer-dead-letter.ts`; os demais são processados normalmente pelo `consumer-order.ts`.

## Dead Letter vs. descartar direto vs. requeue infinito

| | `channel.ack` direto | `nack(msg, false, true)` (requeue) | Dead Letter Exchange |
|---|---|---|---|
| Mensagem problemática | Perdida silenciosamente | Reentregue ao mesmo consumer, podendo travar a fila em loop | Redirecionada para outra fila, visível e inspecionável |
| Rastreabilidade | Nenhuma | Nenhuma (não guarda motivo) | Header `x-death` guarda motivo, fila de origem e contagem |
| Caso de uso típico | Mensagem realmente descartável | Falha temporária que provavelmente funciona na próxima tentativa | Falha permanente, dado inválido, limite de tentativas excedido |
