/**
 * Quick worker health check script
 * Verifies all 4 workers are connected to RabbitMQ and consuming from their queues
 */
import "dotenv/config";
import amqp from "amqplib";

const QUEUES = {
    DOC_ANALYSIS:   "doc-analysis",
    GITHUB_CLONE:   "github-clone",
    AGENT_RUN:      "agent-run",
    NOTIFICATION:   "notification",
};

interface QueueInfo {
    queue: string;
    messageCount: number;
    consumerCount: number;
    status: "healthy" | "warning" | "critical";
    message: string;
}

async function checkQueue(channel: amqp.Channel, queueName: string): Promise<QueueInfo> {
    try {
        const info = await channel.checkQueue(queueName);
        
        let status: "healthy" | "warning" | "critical" = "healthy";
        let message = "OK";

        if (info.consumerCount === 0) {
            status = "critical";
            message = "NO CONSUMERS - Worker not running!";
        } else if (info.messageCount > 10) {
            status = "warning";
            message = `${info.messageCount} messages queued - Worker may be slow`;
        } else if (info.messageCount > 0) {
            message = `${info.messageCount} messages processing`;
        }

        return {
            queue: queueName,
            messageCount: info.messageCount,
            consumerCount: info.consumerCount,
            status,
            message,
        };
    } catch (err) {
        return {
            queue: queueName,
            messageCount: 0,
            consumerCount: 0,
            status: "critical",
            message: `Queue does not exist or connection failed: ${(err as Error).message}`,
        };
    }
}

async function checkAllQueues(): Promise<QueueInfo[]> {
    const url = process.env.AMQP_URL;
    if (!url) {
        throw new Error("AMQP_URL is not configured in .env");
    }

    const conn = await amqp.connect(url);
    const channel = await conn.createChannel();

    const results: QueueInfo[] = [];

    for (const queueName of Object.values(QUEUES)) {
        const result = await checkQueue(channel, queueName);
        results.push(result);
    }

    await channel.close();
    await conn.close();

    return results;
}

function printResults(results: QueueInfo[]) {
    console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
    console.log("║                    WORKER HEALTH CHECK RESULTS                         ║");
    console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

    const statusSymbol = (status: string) => {
        switch (status) {
            case "healthy": return "✅";
            case "warning": return "⚠️";
            case "critical": return "❌";
            default: return "❓";
        }
    };

    const workerNames: Record<string, string> = {
        "doc-analysis": "Doc Worker",
        "github-clone": "GitHub Worker",
        "agent-run": "Agent Worker",
        "notification": "Notification Worker",
    };

    for (const result of results) {
        const symbol = statusSymbol(result.status);
        const workerName = workerNames[result.queue] || result.queue;
        
        console.log(`${symbol} ${workerName.padEnd(20)} | Queue: ${result.queue}`);
        console.log(`   Consumers: ${result.consumerCount} | Messages: ${result.messageCount}`);
        console.log(`   Status: ${result.message}`);
        console.log("");
    }

    const allHealthy = results.every(r => r.status === "healthy");
    const hasCritical = results.some(r => r.status === "critical");
    const hasWarning = results.some(r => r.status === "warning");

    console.log("╔════════════════════════════════════════════════════════════════════════╗");
    if (allHealthy) {
        console.log("║  ✅ ALL WORKERS HEALTHY - System is operational                        ║");
    } else if (hasCritical) {
        console.log("║  ❌ CRITICAL ISSUES DETECTED - Immediate action required               ║");
    } else if (hasWarning) {
        console.log("║  ⚠️  WARNINGS DETECTED - Monitor closely                               ║");
    }
    console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

    return { allHealthy, hasCritical, hasWarning };
}

async function main() {
    try {
        console.log("Connecting to RabbitMQ...");
        const results = await checkAllQueues();
        const { allHealthy, hasCritical } = printResults(results);

        if (!allHealthy) {
            console.log("📋 Troubleshooting Steps:");
            console.log("");
            
            for (const result of results.filter(r => r.status !== "healthy")) {
                const workerCommand = {
                    "doc-analysis": "npm run worker:doc",
                    "github-clone": "npm run worker:github",
                    "agent-run": "npm run worker:agent",
                    "notification": "npm run worker:notification",
                }[result.queue];

                if (result.consumerCount === 0) {
                    console.log(`❌ ${result.queue}:`);
                    console.log(`   1. Start the worker: ${workerCommand}`);
                    console.log(`   2. Check logs for errors`);
                    console.log(`   3. Verify CLOUDAMQP_URL in .env`);
                    console.log("");
                } else if (result.messageCount > 10) {
                    console.log(`⚠️  ${result.queue}:`);
                    console.log(`   1. Check worker logs: tail -f logs/${result.queue}.log`);
                    console.log(`   2. Verify worker isn't stuck or throwing errors`);
                    console.log(`   3. Consider restarting: ${workerCommand}`);
                    console.log("");
                }
            }
        }

        // Exit with appropriate code
        if (hasCritical) {
            process.exitCode = 2; // Critical failure
        } else if (!allHealthy) {
            process.exitCode = 1; // Warnings
        }
    } catch (err) {
        console.error("❌ Health check failed:", (err as Error).message);
        console.error("");
        console.error("Common causes:");
        console.error("  1. AMQP_URL not set in .env");
        console.error("  2. RabbitMQ server is down");
        console.error("  3. Network connectivity issues");
        console.error("  4. Invalid credentials");
        process.exitCode = 2;
    }
}

main();
