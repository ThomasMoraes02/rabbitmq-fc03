import { createConnection } from "../connection.js";

const QUEUE = 'manual-ack-queue';

async function produce() {
    const { channel } = await createConnection();
    await channel.assertQueue(QUEUE);
    console.log(`Producing message to queue: ${QUEUE}`);
    channel.sendToQueue(QUEUE, Buffer.from('Hello, manual ack!'));
}

async function consume() {
    const { channel } = await createConnection();
    await channel.assertQueue(QUEUE);
    channel.consume(QUEUE, (msg) => {
        if (msg) {
            console.log(`Received message: ${msg.content.toString()}`);
            // Manually acknowledge the message after processing
            channel.ack(msg);
        }
    });
}

produce().catch(console.error);
consume().catch(console.error);