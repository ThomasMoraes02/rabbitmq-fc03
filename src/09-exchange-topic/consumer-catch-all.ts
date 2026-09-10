import { createConnection } from "../connection.js";

const EXCHANGE_NAME = 'amq.topic';
const QUEUE = 'catch-all-queue';
const ROUTING_KEY = '#';

async function consume() {
    const { channel } = await createConnection();

    await channel.assertExchange(EXCHANGE_NAME, 'topic');
    await channel.assertQueue(QUEUE);
    await channel.bindQueue(QUEUE, EXCHANGE_NAME, ROUTING_KEY);

    channel.consume(QUEUE, (msg) => {
        if (msg) {
            console.log(`Received message with routing key: ${msg.fields.routingKey}`, msg.content.toString());
            channel.ack(msg);
        }
    });
}
consume().catch(console.error);