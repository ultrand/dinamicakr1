#!/usr/bin/env npx tsx
import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const responses = await prisma.response.count();
  const published = await prisma.studyVersion.findMany({
    where: { isDraft: false },
    orderBy: { number: "desc" },
    include: { _count: { select: { responses: true, tasks: true } } },
  });
  const draft = await prisma.studyVersion.findFirst({
    where: { isDraft: true },
    include: { _count: { select: { tasks: true } } },
  });
  const host = (process.env.DATABASE_URL ?? "").includes("localhost") ? "LOCAL" : "REMOTE";
  console.log(JSON.stringify({ host, totalResponses: responses, published, draftTasks: draft?._count.tasks ?? 0 }, null, 2));
}

main()
  .finally(() => prisma.$disconnect());
