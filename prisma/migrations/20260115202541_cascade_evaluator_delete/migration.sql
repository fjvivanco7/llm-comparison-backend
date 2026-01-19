-- DropForeignKey
ALTER TABLE "public"."qualitative_evaluations" DROP CONSTRAINT "qualitative_evaluations_evaluatorId_fkey";

-- AddForeignKey
ALTER TABLE "qualitative_evaluations" ADD CONSTRAINT "qualitative_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
