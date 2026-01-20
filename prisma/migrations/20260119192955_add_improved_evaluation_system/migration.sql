-- AlterTable
ALTER TABLE "qualitative_evaluations" ADD COLUMN     "bestPracticesScore" INTEGER,
ADD COLUMN     "efficiencyScore" INTEGER,
ADD COLUMN     "errorHandlingScore" INTEGER,
ADD COLUMN     "functionalityScore" INTEGER,
ADD COLUMN     "problemTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "securityScore" INTEGER;

-- CreateTable
CREATE TABLE "comparative_evaluations" (
    "id" SERIAL NOT NULL,
    "queryId" INTEGER NOT NULL,
    "evaluatorId" INTEGER NOT NULL,
    "rankings" JSONB NOT NULL,
    "winnerId" INTEGER,
    "comparisonNotes" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparative_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comparative_evaluations_queryId_evaluatorId_key" ON "comparative_evaluations"("queryId", "evaluatorId");
