import amqp from 'amqplib';
import crypto from 'crypto';

const EXCHANGE_NAME = "amq.fanout";

type Order = {
    id: string;
    customerName: string;
    items: Array<{ productId: string; quantity: number }>
    total: number;
    createdAt: string;
}

export async function publishOrder(order: Order) {
    const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, 'fanout');

    channel.publish(EXCHANGE_NAME, '', Buffer.from(JSON.stringify(order)));

    console.log('Order published:', order);

    setTimeout(() => {
        channel.close();
        connection.close();
    }, 500); // Fechar a conexão após 500ms para garantir que a mensagem seja publicada
}

export async function createAndPublishOrder(data: Omit<Order, 'id' | 'createdAt'>) {
    const order: Order = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...data
    };
    await publishOrder(order);
}

const sampleOrderData = {
    customerName: "John Doe",
    items: [
        { productId: "product-1", quantity: 2 },
        { productId: "product-2", quantity: 1 }
    ],
    total: 100
};

await createAndPublishOrder(sampleOrderData);