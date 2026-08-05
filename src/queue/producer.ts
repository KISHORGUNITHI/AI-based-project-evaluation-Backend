import { connectRabbitMQ } from "../config/rabbitmq";

/** Publish to a durable persistent queue (standard job queues) */
export async function publishMessage<T>(
    queue: string,
    message: T,
): Promise<void> {
    const channel = await connectRabbitMQ();
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
    );
    console.log(`Published message to ${queue}`);
}

/** Publish to a transient auto-delete queue (SSE progress queues) */
export async function publishTransient<T>(
    queue: string,
    message: T,
): Promise<void> {
    const channel = await connectRabbitMQ();
    // Must match the declaration in the controller: durable:false, autoDelete:true
    await channel.assertQueue(queue, { durable: false, autoDelete: true });
    channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: false },
    );
}
