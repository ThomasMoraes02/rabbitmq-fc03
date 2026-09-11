import { createConnection } from "../connection.js";

const EXCHANGE = "orders-exchange";
const ROUTING_KEY = "order.created";

async function produce() {
    const { connection, channel } = await createConnection();
    await channel.assertExchange(EXCHANGE, "direct");

    const orders = [
        { id: 1, product: "Notebook" },
        { id: 2, product: "" }, // produto vazio -> consumer vai rejeitar
        { id: 3, product: "Mouse" },
        { id: 4, product: "" }, // produto vazio -> consumer vai rejeitar
        { id: 5, product: "Teclado" },
    ];

    for (const order of orders) {
        console.log(`Publicando pedido #${order.id} (${order.product || "PRODUTO INVÁLIDO"})`);
        channel.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(order)));
    }

    setTimeout(() => connection.close(), 500);
}

produce().catch(console.error);
