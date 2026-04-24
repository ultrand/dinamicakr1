-- Migration: add label to StudyVersion and comment to Path (non-destructive)
ALTER TABLE "StudyVersion" ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Path"         ADD COLUMN IF NOT EXISTS "comment" TEXT NOT NULL DEFAULT '';
