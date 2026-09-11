import { createConnection } from "../connection.js";

const DLX = "orders-dlx";
const DLQ = "orders-dlq";

async function consume() {
    const { channel } = await createConnection();

    await channel.assertExchange(DLX, "fanout");
    await channel.assertQueue(DLQ);
    await channel.bindQueue(DLQ, DLX, "");

    console.log(`Aguardando mensagens mortas em "${DLQ}"...`);

    channel.consume(DLQ, (msg) => {
        if (!msg) return;

        const order = JSON.parse(msg.content.toString());
        const death = msg.properties.headers?.["x-death"]?.[0];

        console.log(`Mensagem morta recebida: pedido #${order.id}`);
        if (death) {
            console.log(
                `  motivo: ${death.reason} | fila original: ${death.queue} | tentativas: ${death.count}`,
            );
        }

        channel.ack(msg);
    });
}

consume().catch(console.error);
