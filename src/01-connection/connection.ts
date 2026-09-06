import amqp from "amqplib";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
    try {
        const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
        console.log("Connected successfully");

        const channel = await connection.createChannel();
        console.log("Channel created successfully");

        await sleep(30000);

        await channel.close();
        await connection.close();
        console.log("Connection closed successfully");
    } catch (error) {
        console.log("Error occurred:", error);
    }
}

await connect();