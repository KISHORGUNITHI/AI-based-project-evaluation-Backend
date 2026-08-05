-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'AI_EVALUATING', 'AI_COMPLETED', 'JUDGE_EVALUATING', 'COMPLETED');

-- CreateTable
CREATE TABLE "evaluation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "judgeId" TEXT,
    "aiScore" DECIMAL(65,30),
    "judgeScore" DECIMAL(65,30),
    "finalScore" DECIMAL(65,30),
    "feedback" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_submissionId_key" ON "evaluation"("submissionId");

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "judge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
