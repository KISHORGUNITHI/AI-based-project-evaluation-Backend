import prisma from "../db/prisma.js";
import type StudentInterface from "../entites/student.js";

export default class StudentService {
	async createStudent(userId: string, data: StudentInterface) {

        const existingStudent =
            await prisma.student.findUnique({
                where: {
                    userId
                }
            });

        if (existingStudent) {
            throw new Error(
                "Student profile already exists"
            );
        }

        const student =
            await prisma.student.create({

                data: {

                    userId,

                    rollNumber: data.rollNumber,

                    year: data.year,

                    department: data.department,

                    collegeName: data.collegeName,

                    phonenumber: data.phonenumber,

                    cgpa: data.cgpa,

                    githubUrl: data.githubUrl,

                    leetcode: data.leetcode,

                    portfolio: data.portfolio,

                    linkedin: data.linkedin

                }

            });

        return student;

    }

    async getStudent(userId: string) {

        const student =
            await prisma.student.findUnique({

                where: {

                    userId

                }

            });

        if (!student) {

            throw new Error(
                "Student profile not found"
            );

        }

        return student;

    }

	async updateProfile(userId: string, data: Partial<StudentInterface>) {

        const student =
            await prisma.student.update({

                where: {

                    userId

                },

                data: {

                    department: data.department,

                    collegeName: data.collegeName,

                    year: data.year,

                    phonenumber: data.phonenumber,

                    cgpa: data.cgpa,

                    githubUrl: data.githubUrl,

                    leetcode: data.leetcode,

                    portfolio: data.portfolio,

                    linkedin: data.linkedin

                }

            });

        return student;

    }

}