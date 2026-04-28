-- Migration: optional participant name for response identification
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "participantName" TEXT NOT NULL DEFAULT '';
