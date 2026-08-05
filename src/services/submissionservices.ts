import prisma from "../db/prisma.js";
import type SubmissionDTO from "../entites/submission.js";

export default class SubmissionService {
	// Create a new submission — only allowed if no active (non-rejected) submission exists
	async createSubmission(userId: string, data: SubmissionDTO) {
		const project = await prisma.project.findUnique({
			where: { id: data.projectId },
			include: { team: true },
		});
		if (!project) throw new Error("Project not found");

		// Only team leader or creator can submit
		const student = await prisma.student.findUnique({ where: { userId } });
		if (!student) throw new Error("Student profile not found");

		const isLeader = project.team.teamLeaderId === student.id;
		const isCreator = project.team.createdBy === userId;
		if (!isLeader && !isCreator) {
			throw new Error("Only the team leader or creator can submit a project");
		}

		// Submission policy: block if latest submission is active (SUBMITTED or EVALUATING)
		const latestSubmission = await prisma.submission.findFirst({
			where: { projectId: data.projectId },
			orderBy: { version: "desc" },
		});

		if (latestSubmission) {
			if (latestSubmission.status === "SUBMITTED" || latestSubmission.status === "EVALUATING") {
				throw new Error(
					"Your submission is currently under review. You cannot resubmit until the evaluation is complete.",
				);
			}
			if (latestSubmission.status === "EVALUATED") {
				throw new Error(
					"This project has already been evaluated. Contact an admin to unlock resubmission.",
				);
			}
			// REJECTED → allow resubmission
		}

		const nextVersion = latestSubmission ? latestSubmission.version + 1 : 1;

		// Update project status
		await prisma.project.update({
			where: { id: data.projectId },
			data: { status: "SUBMITTED" },
		});

		const submission = await prisma.submission.create({
			data: {
				projectId: data.projectId,
				version: nextVersion,
				githubUrl: data.githubUrl,
				reportUrl: data.reportUrl,
				pptUrl: data.pptUrl,
				videoUrl: data.videoUrl,
				status: "SUBMITTED",
			},
			include: { project: true },
		});

		// Auto-create a PENDING evaluation — AI runs later when judge triggers it
		await prisma.evaluation.create({
			data: {
				projectId: data.projectId,
				submissionId: submission.id,
				status: "PENDING",
				strengths: [],
				weaknesses: [],
				suggestions: [],
			},
		});

		return submission;
	}

	// Admin: unlock resubmission by setting latest submission to REJECTED
	async unlockResubmission(projectId: string) {
		const latest = await prisma.submission.findFirst({
			where: { projectId },
			orderBy: { version: "desc" },
		});
		if (!latest) throw new Error("No submissions found for this project");

		return await prisma.submission.update({
			where: { id: latest.id },
			data: { status: "REJECTED" },
		});
	}

	// Get all submissions for a project
	async getSubmissionsByProject(projectId: string) {
		const project = await prisma.project.findUnique({ where: { id: projectId } });
		if (!project) throw new Error("Project not found");

		return await prisma.submission.findMany({
			where: { projectId },
			include: { project: true },
			orderBy: { version: "desc" },
		});
	}

	// Get a single submission by id
	async getSubmissionById(id: string) {
		const submission = await prisma.submission.findUnique({
			where: { id },
			include: { project: { include: { team: true } } },
		});
		if (!submission) throw new Error("Submission not found");
		return submission;
	}

	// Get latest submission for a project
	async getLatestSubmission(projectId: string) {
		const project = await prisma.project.findUnique({ where: { id: projectId } });
		if (!project) throw new Error("Project not found");

		const submission = await prisma.submission.findFirst({
			where: { projectId },
			orderBy: { version: "desc" },
			include: { project: true },
		});
		if (!submission) throw new Error("No submissions found for this project");
		return submission;
	}

	// Update submission status
	async updateSubmissionStatus(
		id: string,
		status: "SUBMITTED" | "EVALUATING" | "EVALUATED" | "REJECTED",
	) {
		const submission = await prisma.submission.findUnique({ where: { id } });
		if (!submission) throw new Error("Submission not found");

		return await prisma.submission.update({
			where: { id },
			data: { status },
			include: { project: true },
		});
	}
}
