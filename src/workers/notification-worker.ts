/**
 * Notification Worker
 *
 * Consumes: NOTIFICATION queue
 * Sends AI_COMPLETE notifications to all team members of the evaluated project.
 */
import "dotenv/config";
import { consumeQueue } from "../queue/consumer.js";
import { QUEUES } from "../queue/queues.js";
import type { NotificationJob } from "../queue/types.js";
import NotificationService from "../services/notificationservice.js";

const notificationService = new NotificationService();

async function startNotificationWorker() {
    console.log("[notification-worker] Starting...");

    await consumeQueue(QUEUES.NOTIFICATION, async (job: NotificationJob) => {
        const { evaluationId, projectTitle, userIds } = job;
        console.log(`[notification-worker] Notifying ${userIds.length} users for ${evaluationId}: [${userIds.join(', ')}]`);

        const results = await Promise.allSettled(
            userIds.map(userId =>
                notificationService.create(
                    userId,
                    "AI_COMPLETE",
                    `AI evaluation complete for "${projectTitle}"`,
                    evaluationId,
                )
            )
        );

        const failed = results.filter(r => r.status === "rejected");
        if (failed.length > 0) {
            console.warn(`[notification-worker] ${failed.length}/${userIds.length} notifications failed for ${evaluationId}`);
        } else {
            console.log(`[notification-worker] All notifications sent for ${evaluationId}`);
        }
    });
}

startNotificationWorker().catch(console.error);
