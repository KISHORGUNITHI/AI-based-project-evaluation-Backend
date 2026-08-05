import { createClient } from "redis";

let client: ReturnType<typeof createClient> | null = null;
let connectionFailed = false;

/**
 * Returns a connected Redis client singleton.
 * Falls back gracefully if Redis is not configured or fails to connect.
 * Once connection fails, rate limiting is permanently skipped for this process
 * to avoid hanging requests on every reconnect attempt.
 */
export async function getRedisClient(): Promise<ReturnType<typeof createClient> | null> {
    // Already failed — skip immediately, don't retry
    if (connectionFailed) return null;

    if (client?.isReady) return client;

    const url = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 17575;
    const password = process.env.REDIS_PASSWORD;
    const username = process.env.REDIS_USERNAME ?? "default";

    if (!url && !host) {
        console.warn("[redis] No REDIS_URL or REDIS_HOST configured — rate limiting disabled");
        connectionFailed = true;
        return null;
    }

    try {
        const newClient = createClient({
            ...(url
                ? { url }
                : {
                      username,
                      password,
                      socket: {
                          host: host!,
                          port,
                          tls: true,
                          // Reconnect max 3 times then give up
                          reconnectStrategy: (retries) => {
                              if (retries >= 3) {
                                  connectionFailed = true;
                                  return new Error("Redis max retries reached");
                              }
                              return Math.min(retries * 500, 2000);
                          },
                      },
                  }),
        });

        newClient.on("error", (err) => {
            console.error("[redis] Client error:", err.message);
        });

        await newClient.connect();
        console.log("[redis] Connected");
        client = newClient;
    } catch (err) {
        console.error("[redis] Failed to connect — rate limiting disabled:", (err as Error).message);
        connectionFailed = true;
        client = null;
    }

    return client;
}
