import { prisma } from "../lib/prisma.js";

export async function buildAnalytics(studyVersionId: string, filterCriticalTaskId?: string | null) {
  const selections = await prisma.criticalSelection.findMany({
    where: { response: { studyVersionId } },
    select: { taskId: true },
  });
  const criticalRank: Record<string, number> = {};
  for (const s of selections) {
    criticalRank[s.taskId] = (criticalRank[s.taskId] ?? 0) + 1;
  }

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

  for (const p of paths) {
    const crit = p.criticalTaskId;
    const ordered = p.steps.sort((a, b) => a.stepIndex - b.stepIndex);
    const stepIds = ordered.map((s) => s.taskId);

    for (const sid of stepIds) {
      if (sid !== p.criticalTaskId) {
        bottleneck[sid] = (bottleneck[sid] ?? 0) + 1;
      }
    }

    const first = ordered.find((s) => s.stepIndex === 0);
    if (first) {
      step1[first.taskId] = (step1[first.taskId] ?? 0) + 1;
    }

    const seqKey = stepIds.join("→");
    if (!sequencesByCritical[crit]) sequencesByCritical[crit] = {};
    sequencesByCritical[crit][seqKey] = (sequencesByCritical[crit][seqKey] ?? 0) + 1;

    for (let i = 0; i < stepIds.length - 1; i++) {
      const a = stepIds[i];
      const b = stepIds[i + 1];
      const ek = `${a}||${b}`;
      edgeCounts[ek] = (edgeCounts[ek] ?? 0) + 1;
    }
  }

  const tasks = await prisma.task.findMany({
    where: { studyVersionId },
    select: { id: true, verb: true, textoPrincipal: true },
  });
  const taskLabel = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    return t ? `${t.verb} ${t.textoPrincipal}`.trim() : id;
  };

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
    criticalRanking: toRank(criticalRank),
    bottleneckRanking: toRank(bottleneck),
    step1Ranking: toRank(step1),
    commonPathByCritical: commonPaths.sort((a, b) => a.criticalLabel.localeCompare(b.criticalLabel)),
    graph: { nodes: tasks, edges: graphEdges.sort((a, b) => b.weight - a.weight) },
  };
}
