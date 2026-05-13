import type { ExpertGoldCard } from "../data/expertGold";

/** Entrada padrão dos sliders (0–100 cada); normalizeWeights converte para proporção. */
export const DEFAULT_GOLD_WEIGHTS: GoldWeights = {
  criticality: 35,
  consensus: 25,
  frequency: 25,
  recurrence: 15,
};

export type GoldWeights = {
  criticality: number;
  consensus: number;
  frequency: number;
  recurrence: number;
};

/** Evita divisão por zero em 1 / avgPosition. */
export const EPS_POSITION = 0.25;
/** Amortecimento em 1 / (σ + SIGMA_EPS). */
export const SIGMA_EPS = 0.5;
/** Pesos internos da lente "urgência/dor" (somam 1): posição no ranking + votos "mais difícil". */
export const INNER_WEIGHTS_CRITICALITY = { rankInverse: 0.6, hardest: 0.4 } as const;
/** Pesos internos da lente "acordo" (somam 1): σ baixo → invSig; fluxo preenchido → flowCov. */
export const INNER_WEIGHTS_CONSENSUS = { inverseSigma: 0.65, flowCoverage: 0.35 } as const;
/** Pesos internos da lente "frequência de aparição" (somam 1): seleção como crítica + top-5 no ranking. */
export const INNER_WEIGHTS_FREQUENCY = { selection: 0.5, top5: 0.5 } as const;
/** Pesos internos da lente "caminhos" (somam 1): gargalos, início de cadeia, grau no grafo. */
export const INNER_WEIGHTS_RECURRENCE = { bottleneck: 0.4, step1: 0.35, edgeDegree: 0.25 } as const;

/** Piso e teto do tamanho N do ouro pesquisa-derivado. */
export const N_FLOOR = 6;
export const N_CEIL = 14;

export type GraphNode = {
  id: string;
  verb: string;
  textoPrincipal: string;
  etapa: string;
  atividade: string;
};

export type PadraoOuroAnalyticsInput = {
  criticalRanking: { taskId: string; count: number; label: string }[];
  top5Ranking: { taskId: string; count: number; label: string }[];
  avgRankPosition: { taskId: string; avgPosition: number; count: number; label: string }[];
  disagreementIndex: { taskId: string; disagreement: number; count: number; label: string }[];
  hardestCounts: { taskId: string; count: number; label: string }[];
  bottleneckRanking: { taskId: string; count: number; label: string }[];
  step1Ranking: { taskId: string; count: number; label: string }[];
  flowCoverageTop5: { criticalTaskId: string; filledPercent: number; label: string }[];
  graph: { edges: { from: string; to: string; weight: number }[]; nodes?: GraphNode[] };
  medianCriticalSelections?: number;
};

export type GoldTaskBreakdown = {
  taskId: string;
  label: string;
  rawCriticality: number;
  rawConsensus: number;
  rawFrequency: number;
  rawRecurrence: number;
  zCriticality: number;
  zConsensus: number;
  zFrequency: number;
  zRecurrence: number;
  fusedScore: number;
  components: {
    selCount: number;
    top5Count: number;
    avgPosition: number | null;
    rankInverse: number;
    hardestCount: number;
    sigma: number | null;
    invSigma: number;
    flowCovFilledPct: number | null;
    bottleneck: number;
    step1: number;
    edgeDegree: number;
  };
};

export type GoldResearchPack = {
  n: number;
  nFormula: string;
  weightsInput: GoldWeights;
  weightsNormalized: GoldWeights;
  weightsEffective: GoldWeights;
  hasRanking: boolean;
  fusedTop: GoldTaskBreakdown[];
  variantCriticality: GoldTaskBreakdown[];
  variantConsensus: GoldTaskBreakdown[];
  variantFrequency: GoldTaskBreakdown[];
  variantRecurrence: GoldTaskBreakdown[];
};

export function normalizeWeights(w: GoldWeights): GoldWeights {
  const sum = w.criticality + w.consensus + w.frequency + w.recurrence;
  if (sum <= 0) return { criticality: 0.35, consensus: 0.25, frequency: 0.25, recurrence: 0.15 };
  return {
    criticality: w.criticality / sum,
    consensus: w.consensus / sum,
    frequency: w.frequency / sum,
    recurrence: w.recurrence / sum,
  };
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function zScores(values: number[]): number[] {
  const { mean, std } = meanStd(values);
  if (std < 1e-9) return values.map(() => 0);
  return values.map((v) => (v - mean) / std);
}

function maxNormScalar(values: number[]): number[] {
  const m = Math.max(...values.map((v) => Math.abs(v)), 1e-9);
  return values.map((v) => v / m);
}

function labelFor(id: string, data: PadraoOuroAnalyticsInput): string {
  const a =
    data.criticalRanking.find((r) => r.taskId === id) ??
    data.top5Ranking.find((r) => r.taskId === id) ??
    data.avgRankPosition.find((r) => r.taskId === id) ??
    data.disagreementIndex.find((r) => r.taskId === id) ??
    data.hardestCounts.find((r) => r.taskId === id) ??
    data.bottleneckRanking.find((r) => r.taskId === id) ??
    data.step1Ranking.find((r) => r.taskId === id);
  if (a) return a.label;
  const f = data.flowCoverageTop5.find((r) => r.criticalTaskId === id);
  if (f) return f.label;
  const node = data.graph.nodes?.find((n) => n.id === id);
  return node ? `${(node.verb ?? "").toUpperCase()} ${node.textoPrincipal}`.trim() : id;
}

function unionTaskIds(data: PadraoOuroAnalyticsInput): string[] {
  const s = new Set<string>();
  for (const r of data.criticalRanking) s.add(r.taskId);
  for (const r of data.top5Ranking) s.add(r.taskId);
  for (const r of data.avgRankPosition) s.add(r.taskId);
  for (const r of data.disagreementIndex) s.add(r.taskId);
  for (const r of data.hardestCounts) s.add(r.taskId);
  for (const r of data.bottleneckRanking) s.add(r.taskId);
  for (const r of data.step1Ranking) s.add(r.taskId);
  for (const r of data.flowCoverageTop5) s.add(r.criticalTaskId);
  for (const e of data.graph.edges) {
    s.add(e.from);
    s.add(e.to);
  }
  return [...s];
}

function edgeDegree(data: PadraoOuroAnalyticsInput): Record<string, number> {
  const deg: Record<string, number> = {};
  for (const e of data.graph.edges) {
    deg[e.from] = (deg[e.from] ?? 0) + e.weight;
    deg[e.to] = (deg[e.to] ?? 0) + e.weight;
  }
  return deg;
}

function computeN(medianCritical: number | undefined): { n: number; nFormula: string } {
  const raw = medianCritical ?? 0;
  const rounded = Math.round(raw);
  const n = Math.min(N_CEIL, Math.max(N_FLOOR, rounded || N_FLOOR));
  const nFormula = `N = min(${N_CEIL}, max(${N_FLOOR}, round(mediana_críticas_por_envio))) = min(${N_CEIL}, max(${N_FLOOR}, round(${raw}))) = ${n}`;
  return { n, nFormula };
}

function effectiveWeightsAfterZeroVariance(
  w: GoldWeights,
  active: { c: boolean; s: boolean; f: boolean; r: boolean },
): GoldWeights {
  let c = active.c ? w.criticality : 0;
  let s = active.s ? w.consensus : 0;
  let f = active.f ? w.frequency : 0;
  let r = active.r ? w.recurrence : 0;
  const sum = c + s + f + r;
  if (sum <= 0) return { criticality: 0.25, consensus: 0.25, frequency: 0.25, recurrence: 0.25 };
  return { criticality: c / sum, consensus: s / sum, frequency: f / sum, recurrence: r / sum };
}

type RawRow = Omit<GoldTaskBreakdown, "zCriticality" | "zConsensus" | "zFrequency" | "zRecurrence" | "fusedScore">;

function buildRows(ids: string[], data: PadraoOuroAnalyticsInput): RawRow[] {
  const sel = Object.fromEntries(data.criticalRanking.map((x) => [x.taskId, x.count]));
  const t5 = Object.fromEntries(data.top5Ranking.map((x) => [x.taskId, x.count]));
  const avgP = Object.fromEntries(data.avgRankPosition.map((x) => [x.taskId, x.avgPosition]));
  const sigma = Object.fromEntries(data.disagreementIndex.map((x) => [x.taskId, x.disagreement]));
  const hard = Object.fromEntries(data.hardestCounts.map((x) => [x.taskId, x.count]));
  const bot = Object.fromEntries(data.bottleneckRanking.map((x) => [x.taskId, x.count]));
  const s1 = Object.fromEntries(data.step1Ranking.map((x) => [x.taskId, x.count]));
  const flow = Object.fromEntries(data.flowCoverageTop5.map((x) => [x.criticalTaskId, x.filledPercent]));
  const deg = edgeDegree(data);

  const invSigmas = ids.map((id) => {
    const sig = sigma[id];
    return sig == null ? null : 1 / (sig + SIGMA_EPS);
  });
  const definedInv = invSigmas.filter((x): x is number => x != null);
  const medianInv =
    definedInv.length === 0
      ? 0
      : [...definedInv].sort((a, b) => a - b)[Math.floor((definedInv.length - 1) / 2)]!;

  return ids.map((id) => {
    const selCount = sel[id] ?? 0;
    const top5Count = t5[id] ?? 0;
    const avg = avgP[id];
    const rankInverse = avg == null ? 0 : 1 / (avg + EPS_POSITION);
    const hardestCount = hard[id] ?? 0;
    const sig = sigma[id];
    const invSigma = sig == null ? medianInv : 1 / (sig + SIGMA_EPS);
    const flowCov = flow[id];
    const flowCovFilledPct = flowCov == null ? null : flowCov;
    const bottleneck = bot[id] ?? 0;
    const step1 = s1[id] ?? 0;
    const edgeD = deg[id] ?? 0;

    return {
      taskId: id,
      label: labelFor(id, data),
      rawCriticality: 0,
      rawConsensus: 0,
      rawFrequency: 0,
      rawRecurrence: 0,
      components: {
        selCount,
        top5Count,
        avgPosition: avg ?? null,
        rankInverse,
        hardestCount,
        sigma: sig ?? null,
        invSigma,
        flowCovFilledPct,
        bottleneck,
        step1,
        edgeDegree: edgeD,
      },
    };
  });
}

function applyLensRaw(rows: RawRow[]): GoldTaskBreakdown[] {
  const rankV = rows.map((r) => r.components.rankInverse);
  const hardV = rows.map((r) => r.components.hardestCount);
  const nRank = maxNormScalar(rankV);
  const nHard = maxNormScalar(hardV);

  const invV = rows.map((r) => r.components.invSigma);
  const flowV = rows.map((r) => (r.components.flowCovFilledPct == null ? 0 : r.components.flowCovFilledPct / 100));
  const nInv = maxNormScalar(invV);
  const nFlow = maxNormScalar(flowV);

  const selV = rows.map((r) => r.components.selCount);
  const t5V = rows.map((r) => r.components.top5Count);
  const nSel = maxNormScalar(selV);
  const nT5 = maxNormScalar(t5V);

  const botV = rows.map((r) => r.components.bottleneck);
  const s1V = rows.map((r) => r.components.step1);
  const edV = rows.map((r) => r.components.edgeDegree);
  const nBot = maxNormScalar(botV);
  const nS1 = maxNormScalar(s1V);
  const nEd = maxNormScalar(edV);

  return rows.map((r, i) => {
    const rawCriticality =
      INNER_WEIGHTS_CRITICALITY.rankInverse * nRank[i]! +
      INNER_WEIGHTS_CRITICALITY.hardest * nHard[i]!;
    const rawConsensus =
      INNER_WEIGHTS_CONSENSUS.inverseSigma * nInv[i]! +
      INNER_WEIGHTS_CONSENSUS.flowCoverage * nFlow[i]!;
    const rawFrequency =
      INNER_WEIGHTS_FREQUENCY.selection * nSel[i]! +
      INNER_WEIGHTS_FREQUENCY.top5 * nT5[i]!;
    const rawRecurrence =
      INNER_WEIGHTS_RECURRENCE.bottleneck * nBot[i]! +
      INNER_WEIGHTS_RECURRENCE.step1 * nS1[i]! +
      INNER_WEIGHTS_RECURRENCE.edgeDegree * nEd[i]!;
    return {
      ...r,
      rawCriticality,
      rawConsensus,
      rawFrequency,
      rawRecurrence,
      zCriticality: 0,
      zConsensus: 0,
      zFrequency: 0,
      zRecurrence: 0,
      fusedScore: 0,
    };
  });
}

function assignZAndFuse(rows: GoldTaskBreakdown[], wNorm: GoldWeights): GoldTaskBreakdown[] {
  const zC = zScores(rows.map((r) => r.rawCriticality));
  const zS = zScores(rows.map((r) => r.rawConsensus));
  const zF = zScores(rows.map((r) => r.rawFrequency));
  const zR = zScores(rows.map((r) => r.rawRecurrence));

  const active = {
    c: zC.some((z) => Math.abs(z) > 1e-9),
    s: zS.some((z) => Math.abs(z) > 1e-9),
    f: zF.some((z) => Math.abs(z) > 1e-9),
    r: zR.some((z) => Math.abs(z) > 1e-9),
  };
  const w = effectiveWeightsAfterZeroVariance(wNorm, active);

  return rows.map((r, i) => {
    const fusedScore =
      w.criticality * zC[i]! +
      w.consensus * zS[i]! +
      w.frequency * zF[i]! +
      w.recurrence * zR[i]!;
    return {
      ...r,
      zCriticality: zC[i]!,
      zConsensus: zS[i]!,
      zFrequency: zF[i]!,
      zRecurrence: zR[i]!,
      fusedScore,
    };
  });
}

function sortByScore(
  rows: GoldTaskBreakdown[],
  key: "fusedScore" | "zCriticality" | "zConsensus" | "zFrequency" | "zRecurrence",
): GoldTaskBreakdown[] {
  return [...rows].sort((a, b) => b[key] - a[key]);
}

export function computePadraoOuroResearch(
  data: PadraoOuroAnalyticsInput,
  weights: GoldWeights,
): GoldResearchPack {
  const ids = unionTaskIds(data);
  const hasRanking = data.avgRankPosition.length > 0 || data.disagreementIndex.length > 0;

  const base = buildRows(ids, data);
  const withLens = applyLensRaw(base);
  const wNorm = normalizeWeights(weights);
  const withZ = assignZAndFuse(withLens, wNorm);

  const zC = zScores(withLens.map((r) => r.rawCriticality));
  const zS = zScores(withLens.map((r) => r.rawConsensus));
  const zF = zScores(withLens.map((r) => r.rawFrequency));
  const zR = zScores(withLens.map((r) => r.rawRecurrence));
  const active = {
    c: zC.some((z) => Math.abs(z) > 1e-9),
    s: zS.some((z) => Math.abs(z) > 1e-9),
    f: zF.some((z) => Math.abs(z) > 1e-9),
    r: zR.some((z) => Math.abs(z) > 1e-9),
  };
  const weightsEffective = effectiveWeightsAfterZeroVariance(wNorm, active);

  const { n, nFormula } = computeN(data.medianCriticalSelections);

  const fusedTop = sortByScore(withZ, "fusedScore").slice(0, n);
  const variantCriticality = sortByScore(withZ, "zCriticality").slice(0, n);
  const variantConsensus = sortByScore(withZ, "zConsensus").slice(0, n);
  const variantFrequency = sortByScore(withZ, "zFrequency").slice(0, n);
  const variantRecurrence = sortByScore(withZ, "zRecurrence").slice(0, n);

  return {
    n,
    nFormula,
    weightsInput: { ...weights },
    weightsNormalized: wNorm,
    weightsEffective,
    hasRanking,
    fusedTop,
    variantCriticality,
    variantConsensus,
    variantFrequency,
    variantRecurrence,
  };
}

export function matchExpertCardsToTasks(
  cards: ExpertGoldCard[],
  nodes: GraphNode[] | undefined,
): { card: ExpertGoldCard; taskId: string | null; label: string | null }[] {
  if (!nodes?.length) {
    return cards.map((card) => ({ card, taskId: null, label: null }));
  }
  const norm = (s: string) => s.trim().toLowerCase();
  return cards.map((card) => {
    const hit = nodes.find(
      (n) => norm(n.verb) === norm(card.verb) && norm(n.textoPrincipal) === norm(card.textoPrincipal),
    );
    return {
      card,
      taskId: hit?.id ?? null,
      label: hit ? `${(hit.verb ?? "").toUpperCase()} ${hit.textoPrincipal}`.trim() : null,
    };
  });
}

export type DiffStatus = "agree" | "expert_only" | "research_only" | "reorder";

export function diffExpertVsResearch(
  expertOrderedTaskIds: (string | null)[],
  researchTop: GoldTaskBreakdown[],
): {
  taskId: string | null;
  label: string;
  expertPos: number | null;
  researchPos: number | null;
  status: DiffStatus;
}[] {
  const resPos = new Map<string, number>();
  researchTop.forEach((r, i) => resPos.set(r.taskId, i + 1));

  const expertPos = new Map<string, number>();
  expertOrderedTaskIds.forEach((tid, i) => {
    if (tid) expertPos.set(tid, i + 1);
  });

  const allIds = new Set<string>();
  for (const tid of expertOrderedTaskIds) if (tid) allIds.add(tid);
  for (const r of researchTop) allIds.add(r.taskId);

  const rows: {
    taskId: string | null;
    label: string;
    expertPos: number | null;
    researchPos: number | null;
    status: DiffStatus;
  }[] = [];

  for (const tid of allIds) {
    const ep = expertPos.get(tid) ?? null;
    const rp = resPos.get(tid) ?? null;
    const label = researchTop.find((x) => x.taskId === tid)?.label ?? tid;
    let status: DiffStatus;
    if (ep != null && rp != null) {
      const spread = Math.abs(ep - rp);
      const threshold = Math.max(2, Math.ceil(researchTop.length / 3));
      status = spread <= threshold ? "agree" : "reorder";
    } else if (ep != null) status = "expert_only";
    else status = "research_only";

    rows.push({ taskId: tid, label, expertPos: ep, researchPos: rp, status });
  }

  rows.sort((a, b) => {
    const ak = a.expertPos ?? 999;
    const bk = b.expertPos ?? 999;
    if (ak !== bk) return ak - bk;
    return (a.researchPos ?? 999) - (b.researchPos ?? 999);
  });

  return rows;
}
