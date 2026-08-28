#!/usr/bin/env npx tsx
import "../src/env.js";
import { getOrCreateStudy, publishDraft } from "../src/services/studyService.js";
import { prisma } from "../src/lib/prisma.js";

const label = process.argv[2] ?? "Método — max 10 total";

async function main() {
  const study = await getOrCreateStudy();
  const result = await publishDraft(study.id, { label });
  console.log(`Publicado v${result.published.number}: ${label}`);
  const s = JSON.parse(result.published.settingsJson ?? "{}") as { step1Sub?: string; maxCriticalSelected?: number };
  console.log("step1Sub:", s.step1Sub?.slice(0, 80) + "…");
  console.log("maxCriticalSelected:", s.maxCriticalSelected);
}

main()
  .finally(() => prisma.$disconnect());
