import "../src/env.js";
import { applyStageToDraft } from "../src/services/stageDraftService.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const result = await applyStageToDraft("metodo");
  console.log(`Rascunho Método pronto: ${result.tasksCreated} cards (draft ${result.draftId}).`);
  console.log("Versões Escopo publicadas não foram alteradas. Publique o rascunho quando estiver ok.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
