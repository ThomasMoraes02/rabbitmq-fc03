import amqp from "amqplib";
import { createConnection } from "../connection.js";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendTask() {
    const { connection, channel } = await createConnection();

    const queue = 'work_queue';
    await channel.assertQueue(queue);

    for (let i = 1; i <= 50; i++) {
        const dots = ".".repeat(i);
        const message = `Task ${i}: ${dots}`;

        channel.sendToQueue(queue, Buffer.from(message));

        console.log(`[X] Task ${i} sent: ${message}`);
        await sleep(500); // Adiciona um pequeno atraso entre o envio das tarefas
    }

    setTimeout(() => {
        connection.close();
        process.exit(0);
    }, 500);
}

sendTask().catch(console.error);