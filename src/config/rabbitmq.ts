import amqp, { Channel, ChannelModel } from "amqplib";
import "dotenv/config"; 

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function connectRabbitMQ(): Promise<Channel> {
  if (channel) {
    return channel;
  }

  const url = process.env.AMQP_URL;

  if (!url) {
    throw new Error("AMQP_URL is not configured");
  }

  connection=await amqp.connect(url);

  connection.on("error",(err)=>{
    console.error("RabbitMQ Connection Error:", err);
  });

  connection.on("close", () => {
    console.warn("RabbitMQ Connection Closed");
    connection = null;
    channel = null;
  });

  channel = await connection.createChannel();

  console.log("✅ Connected to CloudAMQP");

  return channel;
}

export async function closeRabbitMQ() {
  await channel?.close();
  await connection?.close();

  channel = null;
  connection = null;
}