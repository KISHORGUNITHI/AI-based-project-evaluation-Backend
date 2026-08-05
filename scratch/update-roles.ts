import { prisma } from "../src/database/prisma.ts";

async function main() {
  // Update admin@example.com role to ADMIN
  const admin = await prisma.user.updateMany({
    where: { email: "admin@example.com" },
    data: { role: "ADMIN" }
  });
  console.log("Updated admin:", admin);

  // Update judge@example.com role to JUDGE and create Judge profile if it doesn't exist
  const judgeUser = await prisma.user.findUnique({
    where: { email: "judge@example.com" }
  });
  if (judgeUser) {
    await prisma.user.update({
      where: { id: judgeUser.id },
      data: { role: "JUDGE" }
    });
    const existingJudge = await prisma.judge.findUnique({
      where: { userId: judgeUser.id }
    });
    if (!existingJudge) {
      await prisma.judge.create({
        data: {
          userId: judgeUser.id,
          organization: "Test Org",
          designation: "Lead Evaluator",
          expertise: ["AI/ML", "Web Dev"],
          experience: 8
        }
      });
      console.log("Created Judge profile for judge@example.com");
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
