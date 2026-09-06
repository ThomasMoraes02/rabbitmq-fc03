import amqp from "amqplib";
import { createConnection } from "../connection.js";

async function producer() {
    const { connection, channel } = await createConnection();
    const queue = "products";
    await channel.assertQueue(queue);
    
    // O que esse código faz? Me explique detalhadamente
    // Esse código cria uma conexão com o RabbitMQ, cria um canal, declara uma fila chamada 
    // "products",
    // gera 10.000 mensagens de produtos com id, nome e preço aleatório, e envia 
    // todas essas mensagens
    // para a fila "products" de forma assíncrona usando Promise.all. 
    // Após enviar as mensagens, ele fecha a conexão após 500ms.
    const messages = new Array(10000).fill(0).map((_, i) => ({
        id: i,
        name: `Product ${i}`,
        price: Math.floor(Math.random() * 100)
    }))

    await Promise.all(
        messages.map((message) => {
            return channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
                contentType: "application/json"
            });
        })
    );

    console.log(`[X] Sending messages to queue "${queue}"...`);

    setTimeout(() => {
        connection.close();
        process.exit(0);
    }, 500);
}

producer().catch(console.error);