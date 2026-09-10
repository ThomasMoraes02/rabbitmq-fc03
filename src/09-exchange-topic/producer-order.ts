import { createConnection } from "../connection.js";

const EXCHANGE_NAME = 'amq.topic';

interface OrderEvent {
    id: string;
    status: string;
    shippingType?: string;
    createdAt: string;
};

async function produce() {
    const { connection, channel } = await createConnection();

    await channel.assertExchange(EXCHANGE_NAME, 'topic');

    const now = new Date().toISOString();

    const events: Array<{ routingKey: string;  event: OrderEvent }> = [
        { routingKey: "order.created", event: { id: "1", status: "created", createdAt: now } },
        { routingKey: "order.paid", event: { id: "1", status: "paid", createdAt: now } },
        { routingKey: "order.shipped.economy", event: { id: "1", status: "shipped", shippingType: "economy", createdAt: now } },
        { routingKey: "order.shipped.express", event: { id: "2", status: "shipped", shippingType: "express", createdAt: now } }
    ];

    for (const { routingKey, event } of events) {
        channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(event)));
        console.log(`Order event published with routing key: ${routingKey}`, event);
    }

    setTimeout(async () => {
        await channel.close();
        await connection.close();
        process.exit(0);
    }, 500);
}

produce().catch(console.error);

