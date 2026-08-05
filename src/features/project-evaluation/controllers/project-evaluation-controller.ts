import type { Request, Response } from "express";
import { publishMessage } from "../../../queue/producer";
import { QUEUES } from "../../../queue/queues";
import { uploadToCloudinary } from "../../../middlewares/upload";

export async function evaluateProject(req: Request, res: Response) {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "PDF file is required.",
        });
    }

    let filePath: string;

    // In production file is in memory buffer — upload to Cloudinary first
    if (req.file.buffer) {
        filePath = await uploadToCloudinary(req.file.buffer, req.file.originalname);
    } else {
        filePath = req.file.path;
    }

    await publishMessage(QUEUES.PDF_EVAL, { filePath });

    return res.status(202).json({
        success: true,
        message: "PDF evaluation queued successfully.",
    });
}

export async function evaluateGithubProject(req: Request, res: Response) {
    const { repositoryUrl } = req.body;

    if (!repositoryUrl) {
        return res.status(400).json({
            success: false,
            message: "Repository URL is required.",
        });
    }

    await publishMessage(QUEUES.GITHUB_EVAL, {
        repositoryUrl,
    });

    return res.status(202).json({
        success: true,
        message: "GitHub evaluation queued successfully.",
    });
}