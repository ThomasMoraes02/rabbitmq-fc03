import amqp from "amqplib";

// Consumer function to receive messages from the RabbitMQ queue
async function consumer() {
    const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
    const channel = await connection.createChannel();

    const queue = "my-queue";
    await channel.assertQueue(queue);

    console.log(`[X] Waiting for messages in queue "${queue}"...`);

    // No RabbitMQ, o consumo de mensagens é feito através do channel, que é a via de comunicação com o servidor RabbitMQ.
    // O channel permite consumir mensagens de forma independente, gerenciando o fluxo de mensagens e o reconhecimento (ack) de cada uma.
    channel.consume(queue, (msg) => {
        if (msg) {
            const payload = JSON.parse(msg.content.toString());
            console.log(`[X] Received message from queue "${queue}":`, payload);

            // Acknowledge the message to remove it from the queue
            // channel.ack(msg);
        }
    }, {
        noAck: true,
    });
}

consumer().catch(console.error);