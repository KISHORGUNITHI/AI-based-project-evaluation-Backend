import type { Request, Response } from "express";
import NotificationService from "../../../services/notificationservice.js";

export default class NotificationController {
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();

        this.getNotifications = this.getNotifications.bind(this);
        this.markRead = this.markRead.bind(this);
        this.markAllRead = this.markAllRead.bind(this);
    }

    async getNotifications(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;
            const page = Number(req.query.page ?? 1);
            const limit = Number(req.query.limit ?? 50); // increased from 10

            console.log(`[notification] GET /notifications for userId=${userId}`);

            const notifications =
                await this.notificationService.getNotifications(
                    userId,
                    page,
                    limit
                );

            console.log(`[notification] Found ${notifications.length} notifications for userId=${userId}`);

            const unreadCount = notifications.filter((n: any) => !n.read).length;

            return res.status(200).json({
                success: true,
                data: notifications,
                unreadCount,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch notifications",
            });
        }
    }

    async markRead(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;

            const id = Array.isArray(req.params.id)
                ? req.params.id[0]
                : req.params.id;

            await this.notificationService.markRead(id, userId);

            return res.status(200).json({
                success: true,
                message: "Notification marked as read",
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to update notification",
            });
        }
    }

    async markAllRead(req: Request, res: Response) {
        try {
            const userId = (req as any).user.id;

            await this.notificationService.markAllRead(userId);

            return res.status(200).json({
                success: true,
                message: "All notifications marked as read",
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to update notifications",
            });
        }
    }
}