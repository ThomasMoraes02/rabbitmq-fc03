import { createConnection } from "../connection.js";

const EXCHANGE = "orders-exchange";
const DLX = "orders-dlx";
const QUEUE = "orders-queue";
const ROUTING_KEY = "order.created";

async function consume() {
    const { channel } = await createConnection();

    await channel.assertExchange(EXCHANGE, "direct");
    await channel.assertExchange(DLX, "fanout");

    // Fila principal: mensagens rejeitadas com requeue:false caem na DLX
    await channel.assertQueue(QUEUE, {
        deadLetterExchange: DLX,
    });
    await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

    console.log(`Aguardando pedidos em "${QUEUE}"...`);

    channel.consume(QUEUE, (msg) => {
        if (!msg) return;

        const order = JSON.parse(msg.content.toString());
        console.log(`Processando pedido #${order.id}: ${order.product || "(vazio)"}`);

        if (!order.product) {
            console.log(`  -> pedido #${order.id} inválido, rejeitando (vai para a DLQ)`);
            channel.nack(msg, false, false); // requeue:false -> dead letter
            return;
        }

        console.log(`  -> pedido #${order.id} processado com sucesso`);
        channel.ack(msg);
    });
}

consume().catch(console.error);
