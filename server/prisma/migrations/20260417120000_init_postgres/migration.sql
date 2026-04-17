-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Study" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Study_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyVersion" (
    "id" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "StudyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "studyVersionId" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "textoPrincipal" TEXT NOT NULL,
    "atividade" TEXT NOT NULL DEFAULT '',
    "etapa" TEXT NOT NULL DEFAULT '',
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "studyVersionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "helpText" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "studyVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriticalSelection" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "CriticalSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriticalDifficulty" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "whyText" TEXT NOT NULL,

    CONSTRAINT "CriticalDifficulty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptualDifficulty" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ConceptualDifficulty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Path" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "criticalTaskId" TEXT NOT NULL,

    CONSTRAINT "Path_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathStep" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "PathStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyVersion_studyId_isDraft_idx" ON "StudyVersion"("studyId", "isDraft");

-- CreateIndex
CREATE INDEX "StudyVersion_studyId_number_idx" ON "StudyVersion"("studyId", "number");

-- CreateIndex
CREATE INDEX "Task_studyVersionId_idx" ON "Task"("studyVersionId");

-- CreateIndex
CREATE INDEX "Task_studyVersionId_inactive_idx" ON "Task"("studyVersionId", "inactive");

-- CreateIndex
CREATE INDEX "Question_studyVersionId_idx" ON "Question"("studyVersionId");

-- CreateIndex
CREATE INDEX "CriticalSelection_responseId_idx" ON "CriticalSelection"("responseId");

-- CreateIndex
CREATE INDEX "CriticalSelection_taskId_idx" ON "CriticalSelection"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "CriticalDifficulty_responseId_key" ON "CriticalDifficulty"("responseId");

-- CreateIndex
CREATE INDEX "ConceptualDifficulty_responseId_idx" ON "ConceptualDifficulty"("responseId");

-- CreateIndex
CREATE INDEX "ConceptualDifficulty_questionId_idx" ON "ConceptualDifficulty"("questionId");

-- CreateIndex
CREATE INDEX "Path_responseId_idx" ON "Path"("responseId");

-- CreateIndex
CREATE INDEX "Path_criticalTaskId_idx" ON "Path"("criticalTaskId");

-- CreateIndex
CREATE INDEX "PathStep_taskId_idx" ON "PathStep"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "PathStep_pathId_stepIndex_key" ON "PathStep"("pathId", "stepIndex");

-- AddForeignKey
ALTER TABLE "StudyVersion" ADD CONSTRAINT "StudyVersion_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_studyVersionId_fkey" FOREIGN KEY ("studyVersionId") REFERENCES "StudyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_studyVersionId_fkey" FOREIGN KEY ("studyVersionId") REFERENCES "StudyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_studyVersionId_fkey" FOREIGN KEY ("studyVersionId") REFERENCES "StudyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalSelection" ADD CONSTRAINT "CriticalSelection_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalSelection" ADD CONSTRAINT "CriticalSelection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalDifficulty" ADD CONSTRAINT "CriticalDifficulty_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriticalDifficulty" ADD CONSTRAINT "CriticalDifficulty_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptualDifficulty" ADD CONSTRAINT "ConceptualDifficulty_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptualDifficulty" ADD CONSTRAINT "ConceptualDifficulty_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Path" ADD CONSTRAINT "Path_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathStep" ADD CONSTRAINT "PathStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "Path"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathStep" ADD CONSTRAINT "PathStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
