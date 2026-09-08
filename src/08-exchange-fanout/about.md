# Fanout Exchange

A **fanout exchange** é o tipo de exchange mais simples: ela **ignora completamente a routing key** e encaminha uma cópia da mensagem para **todas as filas vinculadas** a ela.

Diferente da `direct` (que compara routing key com binding key para decidir o roteamento), a `fanout` distribui de forma indiscriminada — é um broadcast.

## Quando usar

Quando um mesmo evento precisa ser processado por múltiplos consumers independentes, cada um cuidando de uma responsabilidade diferente — o clássico padrão **pub/sub**. Por exemplo, ao criar um pedido, vários serviços distintos (pagamento, estoque, e-mail) precisam ser notificados, cada um executando sua própria lógica sobre o mesmo evento.

## Funcionamento

```
Producer
   │  channel.publish(exchange, '', message)
   ▼
Exchange (fanout)
   │  ignora a routing key, replica a mensagem
   ├──► Queue payment-queue
   ├──► Queue stock-queue
   └──► Queue email-queue
```

- A routing key usada no `publish` é irrelevante — por convenção, usa-se uma string vazia (`''`).
- Toda fila vinculada à exchange (independentemente da binding key usada) recebe uma cópia da mensagem.
- Se nenhuma fila estiver vinculada, a mensagem é descartada silenciosamente.
- Cada fila é consumida de forma independente, permitindo que múltiplos serviços reajam ao mesmo evento sem acoplamento entre si.

## Exemplo de uso

Neste diretório, o producer publica um pedido (`Order`) na exchange `amq.fanout`, e três consumers independentes — `payment-queue`, `stock-queue` e `email-queue` — recebem, cada um, uma cópia do mesmo pedido:

```ts
// producer-order.ts
const EXCHANGE_NAME = "amq.fanout";

await channel.assertExchange(EXCHANGE_NAME, 'fanout');

// routing key vazia: em fanout ela é ignorada pelo broker
channel.publish(EXCHANGE_NAME, '', Buffer.from(JSON.stringify(order)));
```

```ts
// consumer-payment.ts / consumer-stock.ts / consumer-email.ts
const EXCHANGE_NAME = "amq.fanout";
const QUEUE_NAME = "payment-queue"; // ou "stock-queue" / "email-queue"

await channel.assertExchange(EXCHANGE_NAME, 'fanout');
await channel.assertQueue(QUEUE_NAME);

// binding key '' não importa em fanout, mas ainda é necessário vincular a fila
await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');

channel.consume(QUEUE_NAME, (msg) => {
    if (msg) {
        const order = JSON.parse(msg.content.toString());
        console.log("Payment received: ", order);
    }
});
```

Ao publicar **um único pedido**, os três consumers (`payment`, `stock` e `email`) recebem, cada um, sua própria cópia da mensagem e podem processá-la de forma independente.

## Fanout vs Direct

Na `direct`, a binding key define quais filas recebem a mensagem, permitindo roteamento seletivo. Na `fanout`, a binding key é ignorada — todas as filas vinculadas recebem tudo. Por isso a `fanout` é ideal para broadcast de eventos, enquanto a `direct` é ideal quando é preciso filtrar mensagens por tipo/categoria.
