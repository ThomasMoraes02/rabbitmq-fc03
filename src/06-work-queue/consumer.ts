import amqp from "amqplib";
import { createConnection } from "../connection.js";

async function worker() {
    const { connection, channel } = await createConnection();

    const queue = "work_queue";
    await channel.assertQueue(queue);

    console.log(`[*] Worker waiting for messages in queue "${queue}"...`);

    channel.prefetch(1); // Garante que o worker processe apenas uma mensagem por vez

    channel.consume(queue, (msg) => {
        if (msg) {
            const content = msg.content.toString();
            console.log(`[X] Received message: ${content}`);

            const dots = content.split(".").length - 1;
            const timeToProcess = dots * 1000; // Cada ponto representa 1 segundo de processamento

            setTimeout(() => {
                console.log(`[X] Done processing message: ${content}`);
                channel.ack(msg);
            }, timeToProcess);
        }
    }, {
        noAck: false,
    });
}

worker().catch(console.error);