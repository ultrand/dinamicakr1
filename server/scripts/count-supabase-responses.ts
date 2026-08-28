import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const bak = readFileSync(path.join(dir, "../.env.supabase.bak"), "utf-8");
const m = bak.match(/DATABASE_URL="([^"]+)"/);
if (!m) {
  console.log("No DATABASE_URL in backup");
  process.exit(1);
}
await import("../src/env.js");
process.env.DATABASE_URL = m[1];

const { prisma } = await import("../src/lib/prisma.js");

const responses = await prisma.response.count();
const versions = await prisma.studyVersion.findMany({
  where: { isDraft: false },
  orderBy: { number: "desc" },
  include: { _count: { select: { responses: true } } },
});
console.log("SUPABASE total_responses:", responses);
for (const v of versions.slice(0, 8)) {
  console.log(`  v${v.number} label="${v.label}" responses=${v._count.responses}`);
}
await prisma.$disconnect();
