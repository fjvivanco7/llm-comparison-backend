-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerificationExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_queries" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "promptCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'processing',

    CONSTRAINT "user_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_codes" (
    "id" SERIAL NOT NULL,
    "queryId" INTEGER NOT NULL,
    "llmName" TEXT NOT NULL,
    "codeContent" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationTimeMs" INTEGER,

    CONSTRAINT "generated_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_metrics" (
    "id" SERIAL NOT NULL,
    "codeId" INTEGER NOT NULL,
    "passRate" DOUBLE PRECISION DEFAULT 0,
    "errorHandlingScore" DOUBLE PRECISION DEFAULT 0,
    "runtimeErrorRate" DOUBLE PRECISION DEFAULT 0,
    "avgExecutionTime" DOUBLE PRECISION,
    "memoryUsage" DOUBLE PRECISION,
    "algorithmicComplexity" INTEGER DEFAULT 1,
    "cyclomaticComplexity" INTEGER DEFAULT 1,
    "linesOfCode" INTEGER DEFAULT 0,
    "nestingDepth" INTEGER DEFAULT 1,
    "cohesionScore" DOUBLE PRECISION DEFAULT 100,
    "xssVulnerabilities" INTEGER DEFAULT 0,
    "injectionVulnerabilities" INTEGER DEFAULT 0,
    "hardcodedSecrets" INTEGER DEFAULT 0,
    "unsafeOperations" INTEGER DEFAULT 0,
    "totalScore" DOUBLE PRECISION DEFAULT 0,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_executions" (
    "id" SERIAL NOT NULL,
    "codeId" INTEGER NOT NULL,
    "testCaseNumber" INTEGER NOT NULL,
    "testInput" JSONB NOT NULL,
    "expectedOutput" TEXT,
    "actualOutput" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "executionTimeMs" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_findings" (
    "id" SERIAL NOT NULL,
    "codeId" INTEGER NOT NULL,
    "vulnerabilityType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "lineNumber" INTEGER,
    "patternMatched" TEXT,
    "description" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "code_metrics_codeId_key" ON "code_metrics"("codeId");

-- AddForeignKey
ALTER TABLE "user_queries" ADD CONSTRAINT "user_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_codes" ADD CONSTRAINT "generated_codes_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "user_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_metrics" ADD CONSTRAINT "code_metrics_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "generated_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "generated_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "generated_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
