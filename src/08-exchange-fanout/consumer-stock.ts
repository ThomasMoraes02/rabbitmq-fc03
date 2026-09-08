import amqp from 'amqplib';

const EXCHANGE_NAME = "amq.fanout";
const QUEUE_NAME = "stock-queue";

async function consume(message: string) {
    const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
    const channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, 'fanout');
    await channel.assertQueue(QUEUE_NAME);
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');

    console.log("Waiting for messages in %s. To exit press CTRL+C", QUEUE_NAME);

    channel.consume(QUEUE_NAME, (msg) => {
        if (msg) {
            const order = JSON.parse(msg.content.toString());
            console.log(message, order);

            // O que isso faz?
            // A linha acima confirma que a mensagem foi processada com sucesso.
            // channel.ack(msg);
        }
    });
}

consume("Stock received: ");