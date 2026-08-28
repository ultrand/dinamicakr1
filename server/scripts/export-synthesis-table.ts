/**
 * Gera TSV da tabela de síntese (colar no Excel/Sheets).
 * Uso: npx tsx scripts/export-synthesis-table.ts [studyVersionId]
 * Sem id: usa a versão publicada mais recente com respostas.
 */
import "../src/env.js";
import { writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma.js";
import { buildAnalytics } from "../src/services/analyticsService.js";
import { buildResponsesDetail } from "../src/services/responseDetailService.js";

function taskLabel(t: { verb: string; textoPrincipal: string }) {
  return `${(t.verb ?? "").toUpperCase()} ${t.textoPrincipal}`.trim();
}

function csvCell(v: string | number) {
  const s = String(v ?? "");
  if (/[\t\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/** Tarefas alvo da pergunta “Dificuldades conceituais” (matching por verbo + texto). */
/** Alinhado à pergunta “Dificuldades conceituais” + variantes do catálogo publicado. */
const CONCEPTUAL_TASK_KEYS: { verb: string; textoPrincipal: string }[] = [
  { verb: "Escrever", textoPrincipal: "objetivo geral de pesquisa" },
  { verb: "Escrever", textoPrincipal: "objetivos específicos da pesquisa" },
  { verb: "Assimilar", textoPrincipal: "perfis de pessoas envolvidas" },
  { verb: "Mapear", textoPrincipal: "perfis de pessoas envolvidas" },
  { verb: "Conjecturar", textoPrincipal: "hipóteses de ponto de partida" },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function taskKey(verb: string, texto: string) {
  return `${norm(verb)}|${norm(texto)}`;
}

function matchesConceptualTask(verb: string, textoPrincipal: string): boolean {
  const k = taskKey(verb, textoPrincipal);
  return CONCEPTUAL_TASK_KEYS.some((t) => taskKey(t.verb, t.textoPrincipal) === k);
}

/** Sugestão col. 6 — Tempo (heurística editorial até vocês calibrarem). */
function suggestTempo(etapa: string, atividade: string): string {
  if (etapa === "Condições do Trabalho") return "Muita";
  if (atividade === "Logística da Pesquisa") return "Pouco";
  if (etapa === "Entendimento Preparatório") return "Média";
  return "Média";
}

/** Sugestão col. 7 — proxy por atividade do card (substituir por tipo Eretz quando definido). */
function suggestTipoProjeto(atividade: string, etapa: string): string {
  const map: Record<string, string> = {
    "Instruções do Cliente": "Recomendações estratégicas",
    "Orientações ao Cliente": "Validação de soluções",
    "Pessoas do Serviço": "Capacitação e Inovação",
    "Modelo do Serviço": "Validação de soluções",
    "Direcionamento da Pesquisa": "Recomendações estratégicas",
    "Logística da Pesquisa": "Capacitação e Inovação",
  };
  if (map[atividade]) return map[atividade]!;
  if (etapa === "Definições Preliminares") return "Recomendações estratégicas";
  if (etapa === "Condições do Trabalho") return "Recomendações estratégicas";
  return "— (revisar)";
}

/** Sugestão col. 8 — GESTÃO vs RIGOR por natureza do trabalho no card. */
function suggestNatureza(verb: string, atividade: string): string {
  const rigorVerbs = new Set(["mapear", "associar", "entender", "determinar"]);
  if (rigorVerbs.has(norm(verb))) return "RIGOR";
  if (atividade === "Logística da Pesquisa") return "GESTÃO";
  if (atividade === "Instruções do Cliente" || atividade === "Orientações ao Cliente") return "GESTÃO";
  return "GESTÃO";
}

type Quote = { text: string; source: string };

function collectQuotesForTask(
  taskId: string,
  verb: string,
  textoPrincipal: string,
  detail: Awaited<ReturnType<typeof buildResponsesDetail>>,
): Quote[] {
  const quotes: Quote[] = [];
  const includeConceptual = matchesConceptualTask(verb, textoPrincipal);

  for (const r of detail.responses) {
    for (const b of r.blocks) {
      if (b.type === "hardest_critical" && b.task?.id === taskId && b.whyText) {
        quotes.push({ text: b.whyText, source: r.participantName || r.id.slice(0, 8) });
      }
      if (includeConceptual && b.type === "text_long" && b.text) {
        quotes.push({ text: b.text, source: `conceitual — ${r.participantName || r.id.slice(0, 8)}` });
      }
      if (b.type === "flow_builder_per_critical") {
        for (const f of b.flows) {
          if (f.criticalTaskId === taskId && f.comment) {
            quotes.push({ text: f.comment, source: `fluxo — ${r.participantName || r.id.slice(0, 8)}` });
          }
        }
      }
    }
  }

  return quotes
    .filter((q, i, arr) => arr.findIndex((x) => x.text === q.text && x.source === q.source) === i)
    .slice(0, 3);
}

function formatQuotes(quotes: Quote[]): string {
  if (!quotes.length) return "";
  return quotes.map((q) => `«${q.text}» (${q.source})`).join(" · ");
}

async function resolveVersionId(arg?: string): Promise<string> {
  if (arg) return arg;
  const v = await prisma.studyVersion.findFirst({
    where: { isDraft: false, responses: { some: {} } },
    orderBy: { number: "desc" },
    select: { id: true, number: true },
  });
  if (!v) throw new Error("Nenhuma versão publicada com respostas.");
  console.error(`Versão: v${v.number} (${v.id})`);
  return v.id;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let versionId: string | undefined;
  let outPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") {
      outPath = args[i + 1];
      i++;
      continue;
    }
    if (!args[i]!.startsWith("-")) versionId = args[i];
  }
  return { versionId, outPath };
}

async function main() {
  const { versionId: versionArg, outPath } = parseArgs();
  const versionId = await resolveVersionId(versionArg);
  const [analytics, detail, tasks, ranks] = await Promise.all([
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
  ]);

  const respondedTaskIds = new Set<string>();
  for (const r of ranks) respondedTaskIds.add(r.taskId);
  const selections = await prisma.criticalSelection.findMany({
    where: { response: { studyVersionId: versionId } },
    select: { taskId: true },
  });
  for (const s of selections) respondedTaskIds.add(s.taskId);

  const top5Map = new Map(analytics.top5Ranking.map((x) => [x.taskId, x.count]));
  const disagreeMap = new Map(analytics.disagreementIndex.map((x) => [x.taskId, x.disagreement]));
  const hardestMap = new Map(analytics.hardestCounts.map((x) => [x.taskId, x.count]));
  const bottleneckMap = new Map(analytics.bottleneckRanking.map((x) => [x.taskId, x.count]));
  const posByTask: Record<string, number[]> = {};
  for (const r of ranks) {
    if (!posByTask[r.taskId]) posByTask[r.taskId] = [];
    posByTask[r.taskId]!.push(r.position);
  }

  const headers = [
    "Tarefa",
    "Top-5 (pos. média · vezes no top-5)",
    "Divergência de posição (σ)",
    "Vezes como tarefa mais difícil",
    "Vezes como gargalo/pré-requisito",
    "Tempo (sugestão)",
    "Tipo de projeto (sugestão)",
    "Natureza (sugestão)",
    "Citação qualitativa",
  ];

  const lines: string[] = [headers.map(csvCell).join("\t")];
  lines.push(
    [
      "Exemplo — nome da tarefa",
      "menor pos. média = mais prioritária · maior nº no top-5 = mais frequente",
      "maior σ = mais divergência",
      "maior nº = mais citada como difícil",
      "maior nº = mais usada como pré-requisito",
      "Pouco | Média | Muita",
      "Recomendações estratégicas | Validação de soluções | Capacitação e Inovação",
      "GESTÃO (obrigatório) | RIGOR",
      "Frases literais: dificuldades conceituais (4 tarefas) + comentários de fluxo",
    ]
      .map(csvCell)
      .join("\t"),
  );

  const taskRows = tasks
    .filter((t) => respondedTaskIds.has(t.id))
    .sort((a, b) => taskLabel(a).localeCompare(taskLabel(b), "pt"));

  for (const t of taskRows) {
    const label = taskLabel(t);
    const positions = posByTask[t.id] ?? [];
    const avg =
      positions.length > 0
        ? Math.round((positions.reduce((s, v) => s + v, 0) / positions.length) * 10) / 10
        : null;
    const top5 = top5Map.get(t.id) ?? 0;
    const col2 =
      avg != null ? `pos. méd. ${avg} · top-5: ${top5}/${positions.length}` : top5 > 0 ? `top-5: ${top5}` : "";

    const col3 =
      positions.length >= 2
        ? String(disagreeMap.get(t.id) ?? stddev(positions))
        : positions.length === 1
          ? "—"
          : "";

    const quotes = collectQuotesForTask(t.id, t.verb, t.textoPrincipal, detail);

    lines.push(
      [
        label,
        col2,
        col3,
        hardestMap.get(t.id) ? String(hardestMap.get(t.id)) : "",
        bottleneckMap.get(t.id) ? String(bottleneckMap.get(t.id)) : "",
        suggestTempo(t.etapa, t.atividade),
        suggestTipoProjeto(t.atividade, t.etapa),
        suggestNatureza(t.verb, t.atividade),
        formatQuotes(quotes),
      ]
        .map(csvCell)
        .join("\t"),
    );
  }

  const body = lines.join("\n");
  if (outPath) {
    const resolved = path.resolve(outPath);
    writeFileSync(resolved, "\uFEFF" + body, "utf8");
    console.error(`Gravado: ${resolved} (${taskRows.length} tarefas com resposta)`);
  } else {
    console.log(body);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
