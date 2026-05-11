/**
 * Preenche CriticalRank para respostas antigas que têm fluxos (Path) mas zero ranking.
 *
 * Ordem inferida: criticalTaskId dos paths por `id` asc (ordem de criação), depois
 * demais tarefas da seleção que não apareceram como cabeça de fluxo.
 *
 * Uso (na pasta server/, com DATABASE_URL no .env):
 *   npx tsx scripts/backfill-critical-rank.ts
 *
 * Opcional — só uma versão publicada:
 *   BACKFILL_STUDY_VERSION_ID=clxxx npx tsx scripts/backfill-critical-rank.ts
 */
import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const versionId = typeof process.env.BACKFILL_STUDY_VERSION_ID === "string"
    ? process.env.BACKFILL_STUDY_VERSION_ID.trim()
    : undefined;

  const responses = await prisma.response.findMany({
    where: versionId ? { studyVersionId: versionId } : {},
    select: {
      id: true,
      studyVersionId: true,
      criticalRanks: { select: { id: true } },
      criticalSelections: { select: { taskId: true } },
      paths: { orderBy: { id: "asc" }, select: { criticalTaskId: true } },
    },
  });

  let updated = 0;
  for (const r of responses) {
    if (r.criticalRanks.length > 0) continue;
    const selSet = new Set(r.criticalSelections.map((s) => s.taskId));
    if (selSet.size === 0) continue;

    const order: string[] = [];
    const seen = new Set<string>();
    for (const p of r.paths) {
      if (!selSet.has(p.criticalTaskId) || seen.has(p.criticalTaskId)) continue;
      seen.add(p.criticalTaskId);
      order.push(p.criticalTaskId);
    }
    for (const tid of selSet) {
      if (!seen.has(tid)) order.push(tid);
    }
    if (order.length === 0) continue;

    await prisma.criticalRank.createMany({
      data: order.map((taskId, i) => ({
        responseId: r.id,
        taskId,
        position: i + 1,
      })),
    });
    updated++;
    console.log(`OK response ${r.id} (${order.length} posições)`);
  }

  console.log(`Concluído. Respostas atualizadas: ${updated} de ${responses.length} analisadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
