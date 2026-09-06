# Direct Exchange

A **direct exchange** é o tipo de exchange que encaminha uma mensagem para uma fila somente quando a **routing key** da mensagem é **exatamente igual** à **binding key** usada para ligar aquela fila à exchange.

Diferente da `fanout` (que ignora a routing key e distribui para todas as filas vinculadas), a `direct` permite um roteamento seletivo: cada fila "escuta" apenas as mensagens destinadas a ela.

## Quando usar

Quando existem múltiplos tipos de mensagem/evento sendo publicados na mesma exchange, mas cada consumer só deve receber um subconjunto específico deles — por exemplo, separar logs por severidade (`info`, `warning`, `error`) ou notificações por categoria (`order.created`, `order.cancelled`).

## Funcionamento

```
Producer
   │  channel.publish(exchange, routingKey, message)
   ▼
Exchange (direct)
   │  compara routingKey === bindingKey
   ├──► Queue A (binding key = "error")
   ├──► Queue B (binding key = "warning")
   └──► Queue C (binding key = "info")
```

- Uma fila pode ter **múltiplos bindings** (várias binding keys) para a mesma exchange, recebendo mensagens de mais de um "tipo".
- Se nenhuma fila estiver vinculada com a binding key correspondente, a mensagem é descartada silenciosamente.
- Mais de uma fila pode usar a mesma binding key — nesse caso, todas recebem uma cópia da mensagem.

## Exemplo de uso

```ts
import { createConnection } from "../connection.js";

const { connection, channel } = await createConnection();

const exchange = "logs.direct";
await channel.assertExchange(exchange, "direct");

// Cada fila se liga à exchange usando uma routing key específica
await channel.assertQueue("logs_error");
await channel.bindQueue("logs_error", exchange, "error");

await channel.assertQueue("logs_all");
await channel.bindQueue("logs_all", exchange, "info");
await channel.bindQueue("logs_all", exchange, "warning");
await channel.bindQueue("logs_all", exchange, "error");

// Publicando: só quem tiver binding para "error" recebe esta mensagem
channel.publish(exchange, "error", Buffer.from("Falha ao processar pagamento"));
```

No exemplo acima, `logs_error` recebe apenas mensagens com routing key `"error"`, enquanto `logs_all` recebe `"info"`, `"warning"` e `"error"`, pois está vinculada às três.

## Direct vs Default Exchange

A exchange padrão do RabbitMQ (nome `""`) é, na verdade, uma `direct exchange` implícita, na qual toda fila criada é automaticamente vinculada usando seu próprio nome como binding key. É por isso que `channel.sendToQueue(queue, msg)` funciona como um atalho para `channel.publish("", queue, msg)`.
