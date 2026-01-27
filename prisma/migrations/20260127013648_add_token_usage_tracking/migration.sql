-- CreateTable
CREATE TABLE "token_usage" (
    "id" SERIAL NOT NULL,
    "codeId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_usage_codeId_key" ON "token_usage"("codeId");

-- CreateIndex
CREATE INDEX "token_usage_provider_model_idx" ON "token_usage"("provider", "model");

-- CreateIndex
CREATE INDEX "token_usage_createdAt_idx" ON "token_usage"("createdAt");

-- AddForeignKey
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "generated_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
