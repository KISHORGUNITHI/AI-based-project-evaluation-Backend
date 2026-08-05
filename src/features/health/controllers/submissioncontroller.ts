import type { Request, Response } from "express";
import path from "path";
import SubmissionService from "../../../services/submissionservices.js";

export default class SubmissionController {
	private submissionService: SubmissionService;

	constructor() {
		this.submissionService = new SubmissionService();
		this.createSubmission = this.createSubmission.bind(this);
		this.getSubmissionsByProject = this.getSubmissionsByProject.bind(this);
		this.getSubmissionById = this.getSubmissionById.bind(this);
		this.getLatestSubmission = this.getLatestSubmission.bind(this);
		this.updateSubmissionStatus = this.updateSubmissionStatus.bind(this);
		this.unlockResubmission = this.unlockResubmission.bind(this);
	}

	async createSubmission(req: Request, res: Response) {
		try {
			const userId = String((req as any).user.id);

			const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
			const reportFile = files?.["reportFile"]?.[0];
			const pptFile = files?.["pptFile"]?.[0];

			// In production files are in memory (buffer) — upload to Cloudinary
			// In development files are already on disk — build local /uploads URL
			let reportUrl: string | undefined = req.body.reportUrl as string | undefined;
			let pptUrl: string | undefined = req.body.pptUrl as string | undefined;

			if (reportFile) {
				if (reportFile.buffer) {
					const { uploadToCloudinary } = await import("../../../middlewares/upload.js");
					reportUrl = await uploadToCloudinary(reportFile.buffer, reportFile.originalname);
				} else {
					reportUrl = `/uploads/${path.basename(reportFile.path!)}`;
				}
			}

			if (pptFile) {
				if (pptFile.buffer) {
					const { uploadToCloudinary } = await import("../../../middlewares/upload.js");
					pptUrl = await uploadToCloudinary(pptFile.buffer, pptFile.originalname);
				} else {
					pptUrl = `/uploads/${path.basename(pptFile.path!)}`;
				}
			}

			// No AI at submission time — fast response, AI is triggered later by judge
			const submission = await this.submissionService.createSubmission(userId, {
				projectId: String(req.body.projectId),
				githubUrl: req.body.githubUrl,
				reportUrl,
				pptUrl,
				videoUrl: req.body.videoUrl,
			});

			return res.status(201).json({ message: "Submission created successfully", submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getSubmissionsByProject(req: Request, res: Response) {
		try {
			const submissions = await this.submissionService.getSubmissionsByProject(
				String(req.params["projectId"]),
			);
			return res.status(200).json({ submissions });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async getSubmissionById(req: Request, res: Response) {
		try {
			const submission = await this.submissionService.getSubmissionById(
				String(req.params["id"]),
			);
			return res.status(200).json({ submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async getLatestSubmission(req: Request, res: Response) {
		try {
			const submission = await this.submissionService.getLatestSubmission(
				String(req.params["projectId"]),
			);
			return res.status(200).json({ submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(404).json({ message: msg });
		}
	}

	async updateSubmissionStatus(req: Request, res: Response) {
		try {
			const validStatuses = ["SUBMITTED", "EVALUATING", "EVALUATED", "REJECTED"] as const;
			const status = req.body.status as (typeof validStatuses)[number];
			if (!validStatuses.includes(status)) {
				return res.status(400).json({
					message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
				});
			}
			const submission = await this.submissionService.updateSubmissionStatus(
				String(req.params["id"]),
				status,
			);
			return res.status(200).json({ message: "Submission status updated", submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async unlockResubmission(req: Request, res: Response) {
		try {
			const submission = await this.submissionService.unlockResubmission(
				String(req.params["projectId"]),
			);
			return res.status(200).json({ message: "Resubmission unlocked", submission });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}
}
