# Topic Exchange

A **topic exchange** roteia mensagens comparando a **routing key** publicada com o **binding key** de cada fila usando **padrões com wildcards**. É uma generalização da `direct`: em vez de exigir igualdade exata, permite que uma fila se inscreva em uma "família" de routing keys.

A routing key é sempre composta por palavras separadas por ponto (`.`), por exemplo `order.shipped.express`. O binding key segue o mesmo formato, mas pode usar dois curingas:

- `*` (asterisco) — substitui **exatamente uma** palavra.
- `#` (cerquilha) — substitui **zero ou mais** palavras.

## Quando usar

Quando os eventos publicados têm uma hierarquia natural (`order.created`, `order.shipped.economy`, `order.shipped.express`, ...) e diferentes consumers precisam de fatias diferentes dessa hierarquia — do "só um tipo específico" ao "tudo que existe" — sem precisar de um binding por combinação possível como seria necessário numa `direct`.

## Funcionamento

```
Producer
   │  channel.publish(exchange, "order.shipped.express", message)
   ▼
Exchange (topic)
   │  compara routingKey com o padrão (binding key) de cada fila
   ├──► nfe-queue          (binding = "order.paid")            -> não recebe
   ├──► log-all-order-queue (binding = "order.#")               -> recebe
   ├──► email-queue         (binding = "order.*.*")              -> recebe
   └──► catch-all-queue     (binding = "#")                      -> recebe
```

- Uma fila pode ter múltiplos bindings, assim como na `direct`.
- Se nenhum binding casar com a routing key, a mensagem é descartada silenciosamente.
- `*` casa uma palavra por posição; `#` casa qualquer número de palavras (inclusive zero) e pode aparecer em qualquer posição do padrão.

## Exemplo de uso

Neste diretório, o producer (`producer-order.ts`) publica eventos de pedido na exchange `amq.topic` usando routing keys hierárquicas:

```ts
const events = [
    { routingKey: "order.created", ... },
    { routingKey: "order.paid", ... },
    { routingKey: "order.shipped.economy", ... },
    { routingKey: "order.shipped.express", ... },
];
```

E quatro consumers independentes se inscrevem em fatias diferentes desses eventos:

| Consumer | Fila | Binding key | O que recebe |
|---|---|---|---|
| `consumer-nfe.ts` | `nfe-queue` | `order.paid` | Somente `order.paid` (match exato, igual a uma `direct`) |
| `consumer-log-all-order.ts` | `log-all-order-queue` | `order.#` | Tudo que começa com `order.` — `order.created`, `order.paid`, `order.shipped.economy`, `order.shipped.express` |
| `consumer-email.ts` | `email-queue` | `order.*.*` | Somente routing keys com exatamente 3 palavras começando em `order.` — `order.shipped.economy` e `order.shipped.express` (não recebe `order.created` nem `order.paid`, que têm só 2 palavras) |
| `consumer-catch-all.ts` | `catch-all-queue` | `#` | Absolutamente tudo publicado na exchange |

```ts
await channel.bindQueue("email-queue", "amq.topic", "order.*.*");
```

## Topic vs Direct vs Fanout

| | Fanout | Direct | Topic |
|---|---|---|---|
| Roteamento | Ignora a routing key, envia para todas as filas vinculadas | Routing key precisa ser **igual** ao binding key | Routing key precisa **casar com o padrão** do binding key (`*` e `#`) |
| Granularidade | Nenhuma (broadcast) | Exata, um "tipo" por binding | Hierárquica, uma faixa de "tipos" por binding |
| Caso de uso típico | Notificar vários serviços independentes sobre o mesmo evento (pub/sub) | Rotear por categoria fixa (severidade de log, tipo de evento) | Rotear por categoria hierárquica, com consumers que querem desde um único evento (`order.paid`) até uma família inteira (`order.#`) ou tudo (`#`) |
| Routing key na publicação | Ignorada, geralmente `''` | Obrigatória, comparada por igualdade | Obrigatória, estruturada em palavras separadas por `.` |

Na prática, `direct` é um caso particular de `topic` sem wildcards, e `fanout` é um caso particular de `topic` com binding `#` em todas as filas. A `topic` é a mais flexível das três, mas também a mais fácil de configurar incorretamente: um padrão com o número errado de wildcards (ex.: `order.*.*` quando se queria `order.*`) silenciosamente deixa de casar com routing keys válidas.
