-- Migration: add CriticalRank table (non-destructive)
CREATE TABLE IF NOT EXISTS "CriticalRank" (
    "id"         TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "taskId"     TEXT NOT NULL,
    "position"   INTEGER NOT NULL,
    CONSTRAINT "CriticalRank_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CriticalRank_responseId_idx" ON "CriticalRank"("responseId");
CREATE INDEX IF NOT EXISTS "CriticalRank_taskId_idx"     ON "CriticalRank"("taskId");

ALTER TABLE "CriticalRank"
    ADD CONSTRAINT "CriticalRank_responseId_fkey"
        FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CriticalRank"
    ADD CONSTRAINT "CriticalRank_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
