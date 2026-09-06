import amqp from "amqplib";

interface Payload {
    message: string;
}

// Producer function to send messages to the RabbitMQ queue
async function producer(data: Payload) {
    const connection = await amqp.connect("amqp://admin:admin@localhost:5672");

    // Um channel é uma via de comunicação dentro da conexão com o RabbitMQ. 
    // Ele permite enviar e receber mensagens de forma independente dentro da mesma conexão.
    const channel = await connection.createChannel();

    // Uma fila é uma estrutura de dados usada pelo RabbitMQ para armazenar mensagens até que sejam consumidas por um consumidor.
    const queue = "my-queue";
    const payload: Payload = data

    // A função assertQueue garante que a fila especificada exista antes de enviar mensagens para ela. 
    // Se a fila não existir, ela será criada.
    // A opção durable indica se a fila deve sobreviver a reinicializações do RabbitMQ. 
    // Se definida como true, a fila será persistente e não será perdida quando o servidor RabbitMQ for reiniciado.
    await channel.assertQueue(queue, {
        durable: true
    });
    
    // Um buffer é uma área de memória usada para armazenar dados binários temporariamente. 
    // No contexto do RabbitMQ, usamos Buffer.from() para converter a mensagem em um formato que pode ser enviado pela fila.
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
        contentType: "application/json"
    });

    console.log(`[X] Sent message to queue "${queue}":`, payload);

    setTimeout(() => {
        connection.close();
        process.exit(0);
    }, 500);
}

producer({ message: "Hello, World!" }).catch(console.error);