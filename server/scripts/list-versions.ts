import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const study = await prisma.study.findFirst();
  if (!study) {
    console.log("No study");
    return;
  }
  const versions = await prisma.studyVersion.findMany({
    where: { studyId: study.id },
    orderBy: [{ isDraft: "desc" }, { number: "desc" }],
    include: { _count: { select: { tasks: true, responses: true } } },
  });
  for (const v of versions) {
    console.log(
      `${v.isDraft ? "DRAFT" : `v${v.number}`} | label="${v.label}" | tasks=${v._count.tasks} | responses=${v._count.responses} | id=${v.id}`,
    );
  }
}

main()
  .finally(() => prisma.$disconnect());
