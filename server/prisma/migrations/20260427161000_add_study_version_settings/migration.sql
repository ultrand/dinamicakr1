-- Migration: settings for participant dynamic texts and minimums
ALTER TABLE "StudyVersion" ADD COLUMN IF NOT EXISTS "settingsJson" TEXT NOT NULL DEFAULT '{}';
