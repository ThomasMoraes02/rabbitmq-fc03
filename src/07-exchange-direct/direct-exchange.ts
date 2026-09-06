import { createConnection } from "../connection.js";

interface OrderEvent {
    id: number;
    customer: string;
    event: string;
}

async function sendOrderEvents() {
    const { connection, channel } = await createConnection();

    const exchange = 'amq.direct';

    const ordersEvent: OrderEvent[] = [
        { id: 1, customer: 'John Doe', event: 'order_created' },
        { id: 2, customer: 'Jane Smith', event: 'order_shipped' },
        { id: 3, customer: 'Alice Johnson', event: 'order_created' }
    ];

    for (let i = 0; i < ordersEvent.length; i++) {
        const order = ordersEvent[i];

        const routingKey = order?.event;
        const message = JSON.stringify(order);
        await channel.publish(exchange, routingKey ?? '', Buffer.from(message));
    }
    
    setTimeout(async () => {
        await channel.close();
        await connection.close();
        process.exit(0);
    }, 500);
}

sendOrderEvents().catch(console.error);