import "../src/env.js";
import { applyStageToDraft } from "../src/services/stageDraftService.js";
import { prisma } from "../src/lib/prisma.js";

const stage = (process.argv[2] === "metodo" ? "metodo" : "escopo") as "escopo" | "metodo";

async function main() {
  const result = await applyStageToDraft(stage);
  console.log(`Rascunho ${stage}: ${result.tasksCreated} cards (${result.taskSource}).`);
  console.log("Versões publicadas não foram alteradas.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
