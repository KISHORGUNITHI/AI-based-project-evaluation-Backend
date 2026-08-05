import prisma from "../db/prisma.js";

export default class NotificationService {
    async create(
        userId: string,
        type: string,
        message: string,
        entityId?: string
    ) {
        return prisma.notification.create({
            data: {
                userId,
                type,
                message,
                entityId,
            },
        });
    }

    async getNotifications(
        userId: string,
        page = 1,
        limit = 10
    ) {
        return prisma.notification.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "desc",
            },
            skip: (page - 1) * limit,
            take: limit,
        });
    }

    async markRead(
        id: string,
        userId: string
    ) {
        return prisma.notification.updateMany({
            where: {
                id,
                userId,
            },
            data: {
                read: true,
            },
        });
    }

    async markAllRead(userId: string) {
        return prisma.notification.updateMany({
            where: {
                userId,
                read: false,
            },
            data: {
                read: true,
            },
        });
    }
}