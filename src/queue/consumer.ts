import { connectRabbitMQ } from "../config/rabbitmq";

export async function consumeQueue(
  queue: string,
  handler: (message: any) => Promise<void>,
) {
  const channel = await connectRabbitMQ();

  await channel.assertQueue(queue, {
    durable: true,
  });

  channel.prefetch(1);

  console.log(`Listening on ${queue}`);

  channel.consume(queue, async (msg) => {
    if (!msg) return;

    try {
      const data = JSON.parse(msg.content.toString());

      await handler(data);

      channel.ack(msg);
    } catch (error) {
      console.error(error);

      channel.nack(msg, false, false);
    }
  });
}