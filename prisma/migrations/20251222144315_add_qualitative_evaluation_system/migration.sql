-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'EVALUATOR', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "qualitative_evaluations" (
    "id" SERIAL NOT NULL,
    "codeId" INTEGER NOT NULL,
    "evaluatorId" INTEGER NOT NULL,
    "readabilityScore" INTEGER NOT NULL,
    "clarityScore" INTEGER NOT NULL,
    "structureScore" INTEGER NOT NULL,
    "documentationScore" INTEGER NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "generalComments" TEXT,
    "readabilityComments" TEXT,
    "clarityComments" TEXT,
    "structureComments" TEXT,
    "documentationComments" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualitative_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qualitative_evaluations_codeId_evaluatorId_key" ON "qualitative_evaluations"("codeId", "evaluatorId");

-- AddForeignKey
ALTER TABLE "qualitative_evaluations" ADD CONSTRAINT "qualitative_evaluations_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "generated_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualitative_evaluations" ADD CONSTRAINT "qualitative_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
