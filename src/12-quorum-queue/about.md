# Quorum Queue

Uma **quorum queue** é um tipo de fila do RabbitMQ (desde a versão 3.8) baseado no algoritmo de consenso **Raft**, feito para replicar dados com segurança entre múltiplos nós de um cluster. Diferente da fila clássica (`classic queue`), que por padrão vive em um único nó, a quorum queue existe simultaneamente em vários nós desde a criação, com um deles eleito **líder** e os demais como **seguidores** (followers).

## O que veio resolver

Antes das quorum queues, a única forma de ter uma fila replicada era a **classic mirrored queue** (`ha-mode`), que espelhava a fila clássica para outros nós via um mecanismo de replicação mais antigo. Esse mecanismo tinha problemas conhecidos:

- **Perda de mensagens em split-brain**: em cenários de partição de rede seguida de reconexão, o mirror podia divergir do master e mensagens confirmadas (`ack`) eram perdidas silenciosamente.
- **Sem garantia formal de consistência**: a replicação era assíncrona por padrão e não seguia um protocolo de consenso comprovado; o comportamento sob falha era difícil de prever.
- **Failover custoso e lento**: promover um mirror a master podia demorar e, durante a promoção, mensagens ficavam indisponíveis.
- **Overhead de sincronização**: adicionar um novo mirror exigia sincronizar toda a fila, bloqueando ou degradando o nó durante o processo.

A quorum queue resolve isso trocando o mecanismo de replicação por Raft, que tem garantias formais: uma escrita só é confirmada ao cliente depois de estar persistida na **maioria** (quorum) dos nós que replicam a fila. Isso elimina a perda de mensagens em falhas de um nó e torna o failover previsível e rápido, às custas de mais uso de disco/memória e menor throughput bruto que uma classic queue.

## Quando usar

Quando a fila carrega dados que **não podem ser perdidos** em caso de falha de um nó do cluster — pagamentos, pedidos, eventos de auditoria — e o ambiente já roda em cluster (3+ nós). Não compensa para filas de um único nó, filas efêmeras/temporárias, ou cargas que priorizam throughput máximo acima de durabilidade (nesses casos, `classic queue` é mais simples e mais rápida).

## Como funciona (Raft)

```
Cliente
   │  channel.assertQueue("orders", { arguments: { "x-queue-type": "quorum" } })
   ▼
Nó A (líder)  ──replica──►  Nó B (seguidor)
   │                              │
   └──replica──►  Nó C (seguidor) │
                                  │
Publish: só confirma ao producer depois que a maioria (2 de 3) persistiu a mensagem no log Raft
Consume: só o líder atende consumers; se o líder cai, um seguidor com o log mais atualizado vira líder
```

- Cada quorum queue é um grupo Raft independente: todas as escritas (publish, ack, reject) passam pelo líder, que replica a operação como uma entrada de log para os seguidores.
- Uma operação só é considerada confirmada (e o `ack` retorna ao cliente) depois que a **maioria** dos nós do grupo gravou essa entrada no log — com 3 réplicas, tolera a queda de 1 nó sem perder dados nem disponibilidade; com 5, tolera 2.
- Se o líder cai, os seguidores elegem um novo líder automaticamente entre os que têm o log mais atualizado — não há perda de mensagens já confirmadas.
- Diferente da classic queue, a quorum queue não suporta algumas features: sem prioridade de mensagem, sem TTL por mensagem (só por fila, a partir de versões recentes), sem `x-max-length` com `exact` (usa aproximação), e o número de réplicas é definido no momento da criação (`x-quorum-initial-group-size`), podendo ser ajustado depois via comando administrativo.

## Quorum Queue vs Classic Queue vs Classic Mirrored Queue

| | Classic Queue | Classic Mirrored Queue | Quorum Queue |
|---|---|---|---|
| Replicação | Nenhuma, vive em 1 nó | Assíncrona, via `ha-mode` (mirrors) | Síncrona, via consenso Raft (maioria) |
| Garantia de consistência | Nenhuma além do nó local | Best-effort, pode divergir em split-brain | Formal, baseada em quorum (maioria de nós) |
| Failover | Fila fica indisponível se o nó cai | Promove um mirror, pode perder mensagens não sincronizadas | Elege novo líder automaticamente, sem perda de dados confirmados |
| Throughput | Mais alto | Mais baixo que classic simples (overhead de replicação) | Mais baixo que classic (overhead do consenso), mas previsível |
| Uso de recursos | Baixo | Médio/alto | Mais alto (log Raft, réplicas completas em disco) |
| Caso de uso típico | Filas locais, dados descartáveis, máximo throughput | Legado (obsoleto desde RabbitMQ 3.13, removido depois) | Dados críticos em cluster, onde perda de mensagem não é aceitável |

Desde o RabbitMQ 3.13, a classic mirrored queue está deprecada e a recomendação oficial para qualquer fila que precise de alta disponibilidade é usar quorum queue.
