import { prisma } from "../lib/prisma.js";

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function topTerms(texts: string[], n = 15): { term: string; count: number }[] {
  const STOP = new Set([
    "de","a","o","e","em","na","no","do","da","que","para","com","um","uma","os","as",
    "se","por","mais","ao","à","dos","das","ou","mas","também","é","não","já","foi",
    "ser","ter","há","esta","está","este","esse","essa","isso","isto","the","and","to","of",
  ]);
  const freq: Record<string, number> = {};
  for (const t of texts) {
    for (const word of t.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP.has(w))) {
      freq[word] = (freq[word] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function buildAnalytics(studyVersionId: string, filterCriticalTaskId?: string | null) {
  const responseRows = await prisma.response.findMany({
    where: { studyVersionId },
    select: { id: true, createdAt: true, participantName: true },
    orderBy: { createdAt: "asc" },
  });

  const tasks = await prisma.task.findMany({
    where: { studyVersionId },
    select: { id: true, verb: true, textoPrincipal: true, etapa: true, atividade: true },
  });
  const taskLabel = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    return t ? `${(t.verb ?? "").toUpperCase()} ${t.textoPrincipal}`.trim() : id;
  };

  // ── Seleções críticas ──────────────────────────────────────────────────────
  const selections = await prisma.criticalSelection.findMany({
    where: { response: { studyVersionId } },
    select: { taskId: true },
  });
  const selCount: Record<string, number> = {};
  for (const s of selections) selCount[s.taskId] = (selCount[s.taskId] ?? 0) + 1;

  // ── Ranking (CriticalRank) ─────────────────────────────────────────────────
  const ranks = await prisma.criticalRank.findMany({
    where: { response: { studyVersionId } },
    select: { taskId: true, position: true, responseId: true },
  });

  // top5Ranking: contagem de aparições em position <= 5
  const top5Count: Record<string, number> = {};
  // avgRankPosition: acumula posições por task
  const posAccum: Record<string, number[]> = {};
  for (const r of ranks) {
    if (!posAccum[r.taskId]) posAccum[r.taskId] = [];
    posAccum[r.taskId]!.push(r.position);
    if (r.position <= 5) top5Count[r.taskId] = (top5Count[r.taskId] ?? 0) + 1;
  }
  const avgRankPosition = Object.entries(posAccum).map(([taskId, positions]) => ({
    taskId,
    label: taskLabel(taskId),
    avgPosition: Math.round((positions.reduce((s, v) => s + v, 0) / positions.length) * 10) / 10,
    count: positions.length,
  })).sort((a, b) => a.avgPosition - b.avgPosition);

  const top5Ranking = Object.entries(top5Count)
    .map(([taskId, count]) => ({ taskId, count, label: taskLabel(taskId) }))
    .sort((a, b) => b.count - a.count);

  // disagreementIndex: stddev das posições por task
  const disagreementIndex = Object.entries(posAccum).map(([taskId, positions]) => ({
    taskId,
    label: taskLabel(taskId),
    disagreement: stddev(positions),
    count: positions.length,
  })).sort((a, b) => b.disagreement - a.disagreement);

  // ── Hardest ───────────────────────────────────────────────────────────────
  const hardestRows = await prisma.criticalDifficulty.findMany({
    where: { response: { studyVersionId } },
    select: { taskId: true, whyText: true },
  });
  const hardestCount: Record<string, number> = {};
  for (const h of hardestRows) hardestCount[h.taskId] = (hardestCount[h.taskId] ?? 0) + 1;
  const hardestCounts = Object.entries(hardestCount)
    .map(([taskId, count]) => ({ taskId, count, label: taskLabel(taskId) }))
    .sort((a, b) => b.count - a.count);

  const whyKeywordsTop = topTerms(hardestRows.map((h) => h.whyText ?? "").filter(Boolean));

  // ── Text_long ─────────────────────────────────────────────────────────────
  const longTexts = await prisma.conceptualDifficulty.findMany({
    where: {
      response: { studyVersionId },
      question: { type: "text_long" },
    },
    select: { text: true },
  });
  const longTextKeywordsTop = topTerms(longTexts.map((x) => x.text ?? "").filter(Boolean));

  // ── Fluxos (paths) ────────────────────────────────────────────────────────
  const paths = await prisma.path.findMany({
    where: {
      response: { studyVersionId },
      ...(filterCriticalTaskId ? { criticalTaskId: filterCriticalTaskId } : {}),
    },
    include: {
      steps: { orderBy: { stepIndex: "asc" }, include: { task: true } },
      response: true,
    },
  });

  const bottleneck: Record<string, number> = {};
  const step1: Record<string, number> = {};
  const sequencesByCritical: Record<string, Record<string, number>> = {};
  const edgeCounts: Record<string, number> = {};
  const flowsByCrit: Record<string, { filled: number; empty: number }> = {};

  for (const p of paths) {
    const crit = p.criticalTaskId;
    const ordered = p.steps.sort((a, b) => a.stepIndex - b.stepIndex);
    const stepIds = ordered.map((s) => s.taskId);

    if (!flowsByCrit[crit]) flowsByCrit[crit] = { filled: 0, empty: 0 };
    if (stepIds.length > 0) flowsByCrit[crit]!.filled++;
    else flowsByCrit[crit]!.empty++;

    for (const sid of stepIds) {
      if (sid !== crit) bottleneck[sid] = (bottleneck[sid] ?? 0) + 1;
    }
    const first = ordered.find((s) => s.stepIndex === 0);
    if (first) step1[first.taskId] = (step1[first.taskId] ?? 0) + 1;

    const seqKey = stepIds.join("→");
    if (!sequencesByCritical[crit]) sequencesByCritical[crit] = {};
    sequencesByCritical[crit]![seqKey] = (sequencesByCritical[crit]![seqKey] ?? 0) + 1;

    for (let i = 0; i < stepIds.length - 1; i++) {
      const a = stepIds[i];
      const b = stepIds[i + 1];
      const ek = `${a}||${b}`;
      edgeCounts[ek] = (edgeCounts[ek] ?? 0) + 1;
    }
  }

  // flowCoverageTop5: por task entre as top5 mais rankeadas
  const top5Ids = top5Ranking.slice(0, 5).map((x) => x.taskId);
  const totalResponses = await prisma.response.count({ where: { studyVersionId } });
  const flowCoverageTop5 = top5Ids.map((tid) => {
    const f = flowsByCrit[tid] ?? { filled: 0, empty: 0 };
    const total = totalResponses;
    const skipped = Math.max(0, total - f.filled - f.empty);
    return {
      criticalTaskId: tid,
      label: taskLabel(tid),
      filledCount: f.filled,
      skippedCount: skipped,
      emptyCount: f.empty,
      filledPercent: total > 0 ? Math.round((f.filled / total) * 100) : 0,
    };
  });

  const toRank = (rec: Record<string, number>) =>
    Object.entries(rec)
      .map(([taskId, count]) => ({ taskId, count, label: taskLabel(taskId) }))
      .sort((a, b) => b.count - a.count);

  const commonPaths = Object.entries(sequencesByCritical).map(([criticalTaskId, freq]) => {
    const entries = Object.entries(freq);
    const total = entries.reduce((s, [, c]) => s + c, 0);
    const best = entries.sort((a, b) => b[1] - a[1])[0];
    const pct = total && best ? Math.round((best[1] / total) * 1000) / 10 : 0;
    return {
      criticalTaskId,
      criticalLabel: taskLabel(criticalTaskId),
      sequence: best ? best[0].split("→") : [],
      sequenceLabel: best ? best[0].split("→").map(taskLabel) : [],
      frequency: best ? best[1] : 0,
      percent: pct,
    };
  });

  const graphEdges = Object.entries(edgeCounts).map(([k, weight]) => {
    const [from, to] = k.split("||");
    return { from, to, fromLabel: taskLabel(from!), toLabel: taskLabel(to!), weight };
  });

  return {
    // existentes
    criticalRanking: toRank(selCount),
    bottleneckRanking: toRank(bottleneck),
    step1Ranking: toRank(step1),
    commonPathByCritical: commonPaths.sort((a, b) => a.criticalLabel.localeCompare(b.criticalLabel)),
    graph: { nodes: tasks, edges: graphEdges.sort((a, b) => b.weight - a.weight) },
    // novos
    top5Ranking,
    avgRankPosition,
    disagreementIndex,
    hardestCounts,
    flowCoverageTop5,
    whyKeywordsTop,
    longTextKeywordsTop,
    responses: responseRows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      participantName: (r.participantName ?? "").trim(),
    })),
  };
}
