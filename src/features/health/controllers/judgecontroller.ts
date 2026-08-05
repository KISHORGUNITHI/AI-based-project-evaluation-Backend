import type { Request, Response } from "express";
import type JudgeInterface from "../../../entites/judge.js";
import { auth } from "../../../db/auth.js";
import JudgeService from "../../../services/judgeservices.js";

export default class JudgeController {
	constructor(private judgeService: JudgeService) {}

	async createJudge(req: Request, res: Response) {
		try {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return res.status(401).json({ message: "Unauthorized" });
			}
			const judge = await this.judgeService.createJudge(req.body as JudgeInterface, session.user.id);
			return res.json(judge);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	async getJudgeProfile(req: Request, res: Response) {
		try {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return res.status(401).json({ message: "Unauthorized" });
			}
			const judge = await this.judgeService.getJudgeById(session.user.id);
			return res.json(judge);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}

	async updateJudge(req: Request, res: Response) {
		try {
			const session = await auth.api.getSession({ headers: req.headers });
			if (!session) {
				return res.status(401).json({ message: "Unauthorized" });
			}
			const judge = await this.judgeService.updateJudge(req.body as JudgeInterface, session.user.id);
			return res.json(judge);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}
}
