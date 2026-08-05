import { prisma } from "../src/database/prisma.ts";

async function main() {
  const evaluations = await prisma.evaluation.findMany({
    include: {
      project: true,
      judge: {
        include: {
          user: true
        }
      }
    }
  });
  console.log("EVALUATIONS:");
  for (const e of evaluations) {
    console.log(`- ID: ${e.id}, Project: "${e.project.title}", Status: ${e.status}, Judge: ${e.judge?.user.email ?? 'NONE'}`);
  }

  const users = await prisma.user.findMany();
  console.log("\nUSERS:");
  for (const u of users) {
    console.log(`- Email: ${u.email}, Role: ${u.role}, Name: ${u.name}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
