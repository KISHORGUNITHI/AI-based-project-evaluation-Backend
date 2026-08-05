import type { Request, Response } from "express";
import AnalyticsService from "../../../services/analyticsservice.js";

export default class AnalyticsController {
    private analyticsService: AnalyticsService;

    constructor() {
        this.analyticsService = new AnalyticsService();
        this.getSummary = this.getSummary.bind(this);
    }

    async getSummary(_req: Request, res: Response) {
        try {
            const analytics = await this.analyticsService.getSummary();

            return res.status(200).json({
                success: true,
                data: analytics,
            });
        } catch (error: unknown) {
            const msg =
                error instanceof Error
                    ? error.message
                    : "Failed to fetch analytics summary";

            return res.status(500).json({
                success: false,
                message: msg,
            });
        }
    }
}