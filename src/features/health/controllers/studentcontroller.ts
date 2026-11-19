import type { Request, Response } from "express";
import type StudentInterface from "../../../entites/student.js";
import StudentService from "../../../services/studentservices.js";

function serializeStudent(student: Record<string, unknown>) {
	return {
		...student,
		phonenumber: student.phonenumber !== undefined && student.phonenumber !== null
			? String(student.phonenumber)
			: student.phonenumber,
	};
}

export default class StudentController {
	async createStudent(req: Request, res: Response) {
		try {
			const a: StudentInterface = {
				rollNumber: req.body.rollNumber,
				department: req.body.department,
				collegeName: req.body.collegeName,
				phonenumber: req.body.phonenumber,
				year: req.body.year,
				cgpa: req.body.cgpa,
				githubUrl: req.body.githubUrl,
				leetcode: req.body.leetcode,
				portfolio: req.body.portfolio,
				linkedin: req.body.linkedin,
			};
			const studentService = new StudentService();
			const user_id: string = (req as any).user.id;
			const student = await studentService.createStudent(user_id, a);

			return res.status(201).json({
				message: "Student created successfully",
				student: serializeStudent(student as Record<string, unknown>),
			});
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async updateProfile(req: Request, res: Response) {
		try {
			const a: Partial<StudentInterface> = {
				rollNumber: req.body.rollNumber,
				department: req.body.department,
				collegeName: req.body.collegeName,
				phonenumber: req.body.phonenumber,
				year: req.body.year,
				cgpa: req.body.cgpa,
				githubUrl: req.body.githubUrl,
				leetcode: req.body.leetcode,
				portfolio: req.body.portfolio,
				linkedin: req.body.linkedin,
			};
			const studentService = new StudentService();
			const student = await studentService.updateProfile((req as any).user.id, a);

			return res.status(200).json({
				message: "Profile updated successfully",
				student: serializeStudent(student as Record<string, unknown>),
			});
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async getStudent(req: Request, res: Response) {
		try {
			const studentService = new StudentService();
			const student = await studentService.getStudent((req as any).user.id);

			return res.status(200).json({ student: serializeStudent(student as Record<string, unknown>) });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(400).json({ message: msg });
		}
	}

	async searchStudent(req: Request, res: Response) {
		try {
			const query = req.query["q"] ? String(req.query["q"]).trim() : "";
			if (!query) {
				return res.status(400).json({ message: "Search query 'q' is required" });
			}
			const studentService = new StudentService();
			const student = await studentService.searchStudent(query);
			if (!student) {
				return res.status(404).json({ message: `No student found matching '${query}'` });
			}
			return res.status(200).json({ student: serializeStudent(student as Record<string, unknown>) });
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : "Unknown error";
			return res.status(500).json({ message: msg });
		}
	}
}
