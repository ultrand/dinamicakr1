/**
 * Preenche CriticalRank para respostas antigas sem ranking (inferindo ordem pelos fluxos).
 *
 * Por defeito: só as **4 respostas mais recentes** (sem CriticalRank), por `createdAt` desc.
 * Para todas as respostas elegíveis: `BACKFILL_MAX_RESPONSES=0`
 *
 * `DATABASE_URL` no `server/.env` tem de ser o Postgres real (ex.: Supabase). `localhost` sem
 * servidor Postgres a correr → erro "Can't reach database server".
 *
 * Uso (pasta server/):
 *   npm run backfill:critical-rank
 *
 * Opcional — só uma versão:
 *   BACKFILL_STUDY_VERSION_ID=clxxx npm run backfill:critical-rank
 */
import "../src/env.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
    console.warn(
      "\n⚠️  DATABASE_URL aponta para localhost. Troca no server/.env pela URI do Supabase (ou liga o Postgres local).\n",
    );
  }

  const versionId = typeof process.env.BACKFILL_STUDY_VERSION_ID === "string"
    ? process.env.BACKFILL_STUDY_VERSION_ID.trim()
    : undefined;

  const rawMax = process.env.BACKFILL_MAX_RESPONSES;
  const maxResponses =
    rawMax === "0" || rawMax === "all"
      ? undefined
      : Math.max(1, Number(rawMax || 4) || 4);

  const responses = await prisma.response.findMany({
    where: {
      ...(versionId ? { studyVersionId: versionId } : {}),
      criticalRanks: { none: {} },
    },
    orderBy: { createdAt: "desc" },
    ...(maxResponses !== undefined ? { take: maxResponses } : {}),
    select: {
      id: true,
      studyVersionId: true,
      createdAt: true,
      criticalRanks: { select: { id: true } },
      criticalSelections: { select: { taskId: true } },
      paths: { orderBy: { id: "asc" }, select: { criticalTaskId: true } },
    },
  });

  console.log(
    `Candidatas (sem ranking, mais recentes primeiro): ${responses.length}${maxResponses !== undefined ? ` (máx. ${maxResponses})` : ""}`,
  );

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

    await prisma.$transaction(
      order.map((taskId, i) =>
        prisma.criticalRank.create({
          data: { responseId: r.id, taskId, position: i + 1 },
        }),
      ),
    );
    updated++;
    console.log(`OK ${r.createdAt.toISOString()} — ${r.id} (${order.length} posições)`);
  }

  console.log(`\nConcluído. Respostas atualizadas: ${updated} de ${responses.length} candidatas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
