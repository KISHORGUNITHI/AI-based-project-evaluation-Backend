import { prisma } from "../src/database/prisma";

async function seedProjectAndEvaluation({
  title,
  evalStatus,
  judgeId,
  teamId,
  rubricSet = false
}: {
  title: string;
  evalStatus: "PENDING" | "AI_EVALUATING" | "AI_COMPLETED" | "JUDGE_EVALUATING" | "COMPLETED";
  judgeId: string;
  teamId: string;
  rubricSet?: boolean;
}) {
  // 1. Find or create Project
  let project = await prisma.project.findFirst({
    where: { title, teamId }
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        title,
        domain: "Artificial Intelligence",
        githubUrl: "https://github.com/octocat/Hello-World",
        reportUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        pptUrl: "https://scholar.harvard.edu/files/trenton/files/slides_template.pptx",
        videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        teamId,
        status: "EVALUATING",
      }
    });
  } else {
    project = await prisma.project.update({
      where: { id: project.id },
      data: {
        githubUrl: "https://github.com/octocat/Hello-World",
        reportUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        pptUrl: "https://scholar.harvard.edu/files/trenton/files/slides_template.pptx",
        videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      }
    });
  }

  // 2. Find or create Submission for this project
  let submission = await prisma.submission.findFirst({
    where: { projectId: project.id }
  });
  if (!submission) {
    submission = await prisma.submission.create({
      data: {
        projectId: project.id,
        version: 1,
        githubUrl: "https://github.com/octocat/Hello-World",
        reportUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        pptUrl: "https://scholar.harvard.edu/files/trenton/files/slides_template.pptx",
        videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        status: "SUBMITTED",
      }
    });
  } else {
    submission = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        githubUrl: "https://github.com/octocat/Hello-World",
        reportUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        pptUrl: "https://scholar.harvard.edu/files/trenton/files/slides_template.pptx",
        videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      }
    });
  }

  // 3. Find or create Evaluation
  let evaluation = await prisma.evaluation.findFirst({
    where: { projectId: project.id, submissionId: submission.id }
  });
  if (!evaluation) {
    evaluation = await prisma.evaluation.create({
      data: {
        projectId: project.id,
        submissionId: submission.id,
        judgeId,
        status: evalStatus,
        rubricProblemStatement: 20,
        rubricSolutionDesign: 20,
        rubricImplementation: 25,
        rubricInnovation: 20,
        rubricDocumentation: 15,
        rubricSetByJudge: rubricSet,
      }
    });
  } else {
    evaluation = await prisma.evaluation.update({
      where: { id: evaluation.id },
      data: {
        judgeId,
        status: evalStatus,
        rubricSetByJudge: rubricSet,
      }
    });
  }

  return { project, submission, evaluation };
}

async function main() {
  console.log("Starting test seed script...");

  // 1. Find or create judge accounts "jash" (both jash3@gmail.com and jash2@gmail.com)
  const emails = ["jash3@gmail.com", "jash2@gmail.com"];
  const judges: any[] = [];

  for (const email of emails) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: "JUDGE" },
      create: {
        email,
        name: "jash",
        role: "JUDGE",
        mustChangePassword: false,
      }
    });

    const judge = await prisma.judge.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        organization: "Test Organization",
        designation: "Principal Architect",
        expertise: ["AI", "React", "Node.js"],
        experience: 10,
      }
    });

    judges.push(judge);
    console.log(`Seeded Judge User: ${email} (ID: ${judge.id})`);
  }

  // 2. Find or create a Test Student
  const studentUser = await prisma.user.upsert({
    where: { email: "student@test.com" },
    update: {},
    create: {
      email: "student@test.com",
      name: "Test Student",
      role: "STUDENT",
    }
  });

  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      rollNumber: "TESTSTUDENT123",
      department: "Computer Science",
      collegeName: "University of Tech",
      phonenumber: 9999999999n,
      year: 4,
    }
  });
  console.log(`Seeded Student User: student@test.com (ID: ${student.id})`);

  // 3. Find or create a Test Team
  const team = await prisma.team.upsert({
    where: { name: "[TEST] Team Alpha" },
    update: {},
    create: {
      name: "[TEST] Team Alpha",
      createdBy: studentUser.id,
      teamLeaderId: student.id,
    }
  });
  console.log(`Seeded Team: [TEST] Team Alpha (ID: ${team.id})`);

  // 4. Seed the three projects with varying status, assigned to BOTH judges
  // We can assign different evaluations to each judge if needed, or link them.
  // Note: Since Evaluation is a 1-to-1 with Submission, a submission can only have ONE evaluation.
  // We will assign the evaluations to our primary judge account (jash3@gmail.com) first.
  const targetJudge = judges[0]; // jash3@gmail.com

  console.log("Seeding project assignments for primary judge...");
  
  await seedProjectAndEvaluation({
    title: "[TEST] Project PENDING",
    evalStatus: "PENDING",
    judgeId: targetJudge.id,
    teamId: team.id,
    rubricSet: false,
  });

  await seedProjectAndEvaluation({
    title: "[TEST] Project JUDGE_EVALUATING",
    evalStatus: "JUDGE_EVALUATING",
    judgeId: targetJudge.id,
    teamId: team.id,
    rubricSet: false,
  });

  await seedProjectAndEvaluation({
    title: "[TEST] Project AI_COMPLETED",
    evalStatus: "AI_COMPLETED",
    judgeId: targetJudge.id,
    teamId: team.id,
    rubricSet: true,
  });

  console.log("Seeding project assignments complete!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
