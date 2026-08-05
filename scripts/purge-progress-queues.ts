/**
 * One-shot script: purge all stuck evaluation-progress-* queues
 * Run: npx tsx scripts/purge-progress-queues.ts
 */
import "dotenv/config";
import { connectRabbitMQ } from "../src/config/rabbitmq.js";

async function purge() {
    const channel = await connectRabbitMQ();

    // Get all queues via management API
    const url = process.env.AMQP_URL!;
    // Parse vhost from AMQP URL: amqps://user:pass@host/vhost
    const match = url.match(/\/([^/]+)$/);
    const vhost = match ? encodeURIComponent(match[1]) : "%2F";
    const hostMatch = url.match(/@([^/]+)\//);
    const host = hostMatch ? hostMatch[1] : "";
    const credMatch = url.match(/\/\/([^:]+):([^@]+)@/);
    const user = credMatch ? credMatch[1] : "guest";
    const pass = credMatch ? credMatch[2] : "guest";

    const mgmtUrl = `https://${host}/api/queues/${vhost}`;
    const res = await fetch(mgmtUrl, {
        headers: { Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") },
    });

    if (!res.ok) {
        console.error("Could not reach management API:", res.status, await res.text());
        process.exit(1);
    }

    const queues: Array<{ name: string; messages: number }> = await res.json();
    const progressQueues = queues.filter(q => q.name.startsWith("evaluation-progress-"));

    console.log(`Found ${progressQueues.length} evaluation-progress queues`);

    for (const q of progressQueues) {
        try {
            await channel.purgeQueue(q.name);
            console.log(`  ✓ Purged ${q.name} (had ${q.messages} messages)`);
        } catch (err) {
            console.warn(`  ✗ Could not purge ${q.name}:`, err);
        }
    }

    console.log("Done.");
    process.exit(0);
}

purge().catch(e => { console.error(e); process.exit(1); });
