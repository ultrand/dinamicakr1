/**
 * Gera CSV da tabela de síntese da etapa Método (colar/abrir no Excel/Sheets).
 * Uso: npx tsx scripts/export-synthesis-table-metodo.ts <studyVersionId> [--out arquivo.csv] [--supabase]
 * --supabase: lê DATABASE_URL de server/.env.supabase.bak (produção), só leitura.
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  let versionId: string | undefined;
  let outPath: string | undefined;
  let supabase = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") {
      outPath = args[i + 1];
      i++;
      continue;
    }
    if (args[i] === "--supabase") {
      supabase = true;
      continue;
    }
    if (!args[i]!.startsWith("-")) versionId = args[i];
  }
  return { versionId, outPath, supabase };
}

const { versionId, outPath, supabase } = parseArgs();
if (!versionId) {
  console.error("Informe o studyVersionId.");
  process.exit(1);
}

await import("../src/env.js");
if (supabase) {
  const bak = readFileSync(path.join(scriptDir, "../.env.supabase.bak"), "utf-8");
  const m = bak.match(/DATABASE_URL="([^"]+)"/);
  if (!m) {
    console.error("DATABASE_URL não encontrado em .env.supabase.bak");
    process.exit(1);
  }
  process.env.DATABASE_URL = m[1];
}

const { prisma } = await import("../src/lib/prisma.js");
const { buildAnalytics } = await import("../src/services/analyticsService.js");
const { buildResponsesDetail } = await import("../src/services/responseDetailService.js");

/** Chips do passo 3 (Método) — mesmo texto inserido no campo como `- rótulo -`. */
const METODO_DIFFICULTY_PROMPTS = [
  "Estruturar tabela de screening",
  "Definir perfis generalistas de indivíduos",
  "Definir características e critérios",
  "Definir tamanho da amostra",
] as const;

function taskLabel(t: { verb: string; textoPrincipal: string }) {
  return `${(t.verb ?? "").toUpperCase()} ${t.textoPrincipal}`.trim();
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Sugestão GESTÃO | RIGOR pelo grupo da atividade (antes do “·”). */
function suggestNatureza(atividade: string): string {
  const grupo = norm(atividade.split("·")[0] ?? "");
  const rigor = ["recorte de pesquisa", "tecnicas de coleta", "materiais de coleta", "testagem de materiais"];
  const gestao = ["recrutamento de perfis", "protocolos tecnicos"];
  if (rigor.includes(grupo)) return "RIGOR";
  if (gestao.includes(grupo)) return "GESTÃO";
  return "— (revisar)";
}

type Quote = { text: string; kind: string; who: string };

/** Divide o texto longo pelos marcadores dos chips; devolve trecho por rótulo e o que sobrar sem marcador. */
function splitByChipMarkers(text: string) {
  const hits: { label: string; start: number; end: number }[] = [];
  for (const label of METODO_DIFFICULTY_PROMPTS) {
    const marker = `- ${label} -`;
    let from = 0;
    for (;;) {
      const idx = text.indexOf(marker, from);
      if (idx < 0) break;
      hits.push({ label, start: idx, end: idx + marker.length });
      from = idx + marker.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const clean = (s: string) => s.replace(/^[\s\-–—:;.,]+/, "").replace(/\s+/g, " ").trim();
  const segments: { label: string; text: string }[] = [];
  hits.forEach((h, i) => {
    const next = hits[i + 1]?.start ?? text.length;
    const seg = clean(text.slice(h.end, next));
    if (seg) segments.push({ label: h.label, text: seg });
  });
  const preamble = clean(text.slice(0, hits[0]?.start ?? text.length));
  return { segments, preamble };
}

const [version, analytics, detail, tasks, ranks, selections] = await Promise.all([
  prisma.studyVersion.findUnique({ where: { id: versionId }, select: { number: true, label: true } }),
  buildAnalytics(versionId),
  buildResponsesDetail(versionId),
  prisma.task.findMany({
    where: { studyVersionId: versionId },
    select: { id: true, verb: true, textoPrincipal: true, etapa: true, atividade: true },
  }),
  prisma.criticalRank.findMany({
    where: { response: { studyVersionId: versionId } },
    select: { taskId: true, position: true },
  }),
  prisma.criticalSelection.findMany({
    where: { response: { studyVersionId: versionId } },
    select: { taskId: true },
  }),
]);
if (!version) {
  console.error("Versão não encontrada.");
  process.exit(1);
}
const totalResponses = detail.responses.length;
console.error(`Versão: v${version.number} — ${version.label} (${totalResponses} respostas)`);

const taskByPhrase = new Map(tasks.map((t) => [norm(`${t.verb} ${t.textoPrincipal}`), t]));

const selCount = new Map<string, number>();
for (const s of selections) selCount.set(s.taskId, (selCount.get(s.taskId) ?? 0) + 1);

const posByTask = new Map<string, number[]>();
for (const r of ranks) {
  const list = posByTask.get(r.taskId) ?? [];
  list.push(r.position);
  posByTask.set(r.taskId, list);
}

const top5Map = new Map(analytics.top5Ranking.map((x) => [x.taskId, x.count]));
const disagreeMap = new Map(analytics.disagreementIndex.map((x) => [x.taskId, x.disagreement]));
const hardestMap = new Map(analytics.hardestCounts.map((x) => [x.taskId, x.count]));
const bottleneckMap = new Map(analytics.bottleneckRanking.map((x) => [x.taskId, x.count]));
const step1Map = new Map(analytics.step1Ranking.map((x) => [x.taskId, x.count]));

const quotesByTask = new Map<string, Quote[]>();
const pushQuote = (taskId: string, q: Quote) => {
  const list = quotesByTask.get(taskId) ?? [];
  if (!list.some((x) => x.text === q.text && x.who === q.who)) list.push(q);
  quotesByTask.set(taskId, list);
};
const unattributed: { who: string; text: string }[] = [];

for (const r of detail.responses) {
  const who = r.participantName || r.id.slice(0, 8);
  for (const b of r.blocks) {
    if (b.type === "hardest_critical" && b.task && b.whyText.trim()) {
      pushQuote(b.task.id, { text: b.whyText.trim(), kind: "mais difícil", who });
    }
    if (b.type === "text_long" && b.text.trim()) {
      const { segments, preamble } = splitByChipMarkers(b.text);
      for (const seg of segments) {
        const t = taskByPhrase.get(norm(seg.label));
        if (t) pushQuote(t.id, { text: seg.text, kind: "dificuldade", who });
        else unattributed.push({ who, text: `[${seg.label}] ${seg.text}` });
      }
      if (preamble) unattributed.push({ who, text: preamble });
    }
    if (b.type === "flow_builder_per_critical") {
      for (const f of b.flows) {
        if (f.comment.trim()) pushQuote(f.criticalTaskId, { text: f.comment.trim(), kind: "fluxo", who });
      }
    }
  }
}

const headers = [
  "Tarefa",
  "Etapa / Atividade",
  "Natureza (sugestão)",
  "Vezes selecionada",
  "Pos. média",
  "Top-5 (vezes no top-5)",
  "Divergência de posição (σ)",
  "Vezes como tarefa mais difícil",
  "Vezes como gargalo/pré-requisito",
  "Vezes como 1º passo",
  "Tempo (sugestão)",
  "Tipo de projeto (sugestão)",
  "Citação qualitativa",
];
const example = [
  "Exemplo — nome da tarefa",
  "etapa · atividade do card",
  "GESTÃO (obrigatório) | RIGOR",
  `nº de pessoas que marcaram como relevante (de ${totalResponses})`,
  "menor pos. média = mais prioritária",
  "vezes no top-5 (de vezes ranqueada)",
  "maior σ = mais divergência",
  "maior nº = mais citada como difícil",
  "maior nº = mais usada como pré-requisito",
  "maior nº = mais usada para abrir um fluxo",
  "Pouco | Média | Muita",
  "Recomendações estratégicas | Validação de soluções | Capacitação e Inovação",
  "Frases literais: mais difícil + dificuldades dos chips + comentários de fluxo",
];

/** Evita que Miro/Excel trate "3/6" como data (vira nº serial tipo 36956). */
function ratioLabel(n: number, of: number) {
  return `${n} de ${of}`;
}

const rows = tasks
  .filter((t) => selCount.has(t.id) || posByTask.has(t.id))
  .sort((a, b) => taskLabel(a).localeCompare(taskLabel(b), "pt"));

const lines = [headers.map(csvCell).join(","), example.map(csvCell).join(",")];
for (const t of rows) {
  const positions = posByTask.get(t.id) ?? [];
  const avg = positions.length ? round(positions.reduce((s, v) => s + v, 0) / positions.length, 1) : null;
  const sigma =
    positions.length >= 2 ? String(round(disagreeMap.get(t.id) ?? 0, 2)) : positions.length === 1 ? "—" : "";
  const quotes = (quotesByTask.get(t.id) ?? [])
    .map((q) => `«${q.text}» (${q.kind} — ${q.who})`)
    .join(" · ");

  lines.push(
    [
      taskLabel(t),
      `${t.etapa} · ${t.atividade}`,
      suggestNatureza(t.atividade),
      ratioLabel(selCount.get(t.id) ?? 0, totalResponses),
      avg != null ? String(avg) : "",
      positions.length ? ratioLabel(top5Map.get(t.id) ?? 0, positions.length) : "",
      sigma,
      hardestMap.get(t.id) ? String(hardestMap.get(t.id)) : "",
      bottleneckMap.get(t.id) ? String(bottleneckMap.get(t.id)) : "",
      step1Map.get(t.id) ? String(step1Map.get(t.id)) : "",
      "— (revisar)",
      "— (revisar)",
      quotes,
    ]
      .map(csvCell)
      .join(","),
  );
}

const quoteCount = [...quotesByTask.values()].reduce((s, l) => s + l.length, 0);
console.error(`${rows.length} tarefas com resposta · ${quoteCount} citações atribuídas`);
if (unattributed.length) {
  console.error(`Trechos sem tarefa atribuída (${unattributed.length}):`);
  for (const u of unattributed) console.error(`  [${u.who}] ${u.text}`);
}

const body = lines.join("\r\n");
if (outPath) {
  const resolved = path.resolve(outPath);
  writeFileSync(resolved, "\uFEFF" + body, "utf8");
  console.error(`Gravado: ${resolved}`);
} else {
  console.log(body);
}

await prisma.$disconnect();
