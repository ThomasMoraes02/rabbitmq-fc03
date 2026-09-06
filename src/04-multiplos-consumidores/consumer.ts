import amqp from "amqplib";
import { createConnection } from "../connection.js";

async function consumer() {
    const { connection, channel } = await createConnection();

    const queue = "products";
    await channel.assertQueue(queue);

    console.log(`[X] Waiting for messages in queue "${queue}"...`);

    channel.consume(queue, (msg) => {
        if (msg) {
            const payload = JSON.parse(msg.content.toString());
            console.log(`[X] Received message - Product ID ${payload?.id}`);
        }
    }, {
        noAck: true,
    });
}

consumer().catch(console.error);