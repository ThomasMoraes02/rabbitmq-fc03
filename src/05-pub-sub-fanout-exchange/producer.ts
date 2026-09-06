import amqp from "amqplib";
import { createConnection } from "../connection.js";

async function producer() {
    const { connection, channel } = await createConnection();

    await channel.assertQueue('my-queue');
    await channel.assertQueue('products');

    // Definindo o exchange do tipo fanout, que irá distribuir as mensagens para todas as filas ligadas a ele.
    const exchange = "amq.fanout";
    
    const messages = new Array(10000).fill(0).map((_, i) => ({
        id: i,
        name: `Product ${i}`,
        price: Math.floor(Math.random() * 100)
    }))

    await Promise.all(
        messages.map((message) => {
            // Publicando a mensagem no exchange do tipo fanout, que irá distribuí-la para todas as filas ligadas a ele.
            return channel.publish(exchange, "", Buffer.from(JSON.stringify(message)), {
                contentType: "application/json"
            });
        })
    );

    console.log(`[X] Sending messages to exchange "${exchange}"...`);

    setTimeout(() => {
        connection.close();
        process.exit(0);
    }, 500);
}

producer().catch(console.error);