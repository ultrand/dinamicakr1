import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const bak = readFileSync(path.join(dir, "../.env.supabase.bak"), "utf-8");
const m = bak.match(/DATABASE_URL="([^"]+)"/);
if (!m) process.exit(1);
// env.ts recarrega server/.env com override — aplicar Supabase depois do import.
await import("../src/env.js");
process.env.DATABASE_URL = m[1];

const { prisma } = await import("../src/lib/prisma.js");

const all = await prisma.studyVersion.findMany({
  orderBy: { number: "desc" },
  include: { _count: { select: { responses: true, tasks: true } } },
});
console.log("versions_total", all.length);
for (const v of all) {
  console.log(
    `${v.isDraft ? "DRAFT" : "v" + v.number} | id=${v.id.slice(0, 10)}… | tasks=${v._count.tasks} | resp=${v._count.responses} | label="${v.label}"`,
  );
}
await prisma.$disconnect();
