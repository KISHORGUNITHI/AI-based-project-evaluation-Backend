import prisma from "../db/prisma.js";

export default class AnalyticsService {
    async getSummary() {
        // Projects grouped by status
        const projectStatus = await prisma.project.groupBy({
            by: ["status"],
            _count: {
                status: true,
            },
        });

        // Average scores for completed evaluations
        const averages = await prisma.evaluation.aggregate({
            where: {
                status: "COMPLETED",
            },
            _avg: {
                aiScore: true,
                judgeScore: true,
                finalScore: true,
            },
        });

        // Fetch completed evaluations
        const completedEvaluations = await prisma.evaluation.findMany({
            where: {
                status: "COMPLETED",
                finalScore: {
                    not: null,
                },
            },
            select: {
                finalScore: true,
                project: {
                    select: {
                        id: true,
                        title: true,
                        domain: true,
                    },
                },
            },
        });

        // Score distribution
        const scoreDistribution: Record<string, number> = {
            "0-9": 0,
            "10-19": 0,
            "20-29": 0,
            "30-39": 0,
            "40-49": 0,
            "50-59": 0,
            "60-69": 0,
            "70-79": 0,
            "80-89": 0,
            "90-100": 0,
        };

        completedEvaluations.forEach((evaluation) => {
            const score = Number(evaluation.finalScore);

            if (score >= 90) scoreDistribution["90-100"]++;
            else if (score >= 80) scoreDistribution["80-89"]++;
            else if (score >= 70) scoreDistribution["70-79"]++;
            else if (score >= 60) scoreDistribution["60-69"]++;
            else if (score >= 50) scoreDistribution["50-59"]++;
            else if (score >= 40) scoreDistribution["40-49"]++;
            else if (score >= 30) scoreDistribution["30-39"]++;
            else if (score >= 20) scoreDistribution["20-29"]++;
            else if (score >= 10) scoreDistribution["10-19"]++;
            else scoreDistribution["0-9"]++;
        });

        // Top 5 projects by final score
        const topProjects = completedEvaluations
            .sort(
                (a, b) =>
                    Number(b.finalScore) - Number(a.finalScore),
            )
            .slice(0, 5)
            .map((evaluation) => ({
                id: evaluation.project.id,
                title: evaluation.project.title,
                domain: evaluation.project.domain,
                finalScore: evaluation.finalScore,
            }));

        // Projects grouped by domain
        const projects = await prisma.project.findMany({
            select: {
                domain: true,
            },
        });

        const projectsByDomain: Record<string, number> = {};

        projects.forEach((project) => {
            projectsByDomain[project.domain] =
                (projectsByDomain[project.domain] ?? 0) + 1;
        });

        return {
            projectsByStatus: projectStatus,
            averageScores: averages._avg,
            scoreDistribution,
            topProjects,
            projectsByDomain,
        };
    }
}