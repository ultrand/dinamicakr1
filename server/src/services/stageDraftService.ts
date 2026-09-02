import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { parseTaskLine, type ParsedTaskLine } from "../lib/parseTaskLine.js";
import { ensureDraft, getOrCreateStudy } from "./studyService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ResearchStage = "escopo" | "metodo";

export const ESCOPO_SETTINGS_JSON = {
  researchStage: "escopo" as const,
  stepLabels: ["Seleção", "Ranking", "Perguntas", "Fluxos", "Revisão"],
  step1Title: "Selecione as tarefas críticas",
  step1Sub: "Marque as tarefas indispensáveis para o serviço.",
  step2Title: "Ordene por prioridade",
  step2Sub: "Arraste ou use ↑↓ do mais crítico ao menos crítico.",
  step3Title: "Perguntas sobre o método",
  step3Sub:
    "Entre as tarefas que você selecionou, indique a mais difícil e explique por quê. Nos tópicos listados abaixo, descreva as dificuldades que teve em cada um e explique por quê.",
  step4Title: "Monte os fluxos de tarefas",
  step4Sub:
    "Indique a sequência de passos que leva à tarefa crítica. Arraste do banco ou clique em + para adicionar.",
  step5Title: "Revise e envie",
  step5Sub: "Confirme antes de submeter.",
  minCriticalSelected: 1,
  maxCriticalSelected: null,
  maxCriticalPerGroup: null,
  minFilledFlows: 1,
  pageTitle: "Dinâmica — Tarefas críticas",
  reviewSelectedLabel: "Tarefas críticas selecionadas",
};

export const METODO_SETTINGS_JSON = {
  researchStage: "metodo" as const,
  stepLabels: ["Seleção", "Relevância", "Perguntas", "Fluxos", "Revisão"],
  step1Title: "Selecione até 10 tarefas",
  step1Sub:
    "Escolha as mais relevantes e fundamentais para conduzir o projeto e alinhar com o cliente.",
  step2Title: "Ordene por relevância",
  step2Sub:
    "Da mais fundamental à menos. Não é ordem de execução — avalie cada tarefa individualmente.",
  step3Title: "Dificuldades",
  step3Sub:
    "Entre as tarefas relevantes selecionadas, indique a mais difícil e explique por quê. Depois, para cada tarefa do segundo bloco abaixo, diga também o que dificulta a execução.",
  step4Title: "Monte os fluxos",
  step4Sub:
    "Para cada tarefa relevante, indique a sequência de passos (pré-requisitos) necessários até chegar nela.",
  step5Title: "Revise e envie",
  step5Sub: "Confirme antes de submeter.",
  minCriticalSelected: 1,
  maxCriticalSelected: 10,
  maxCriticalPerGroup: null,
  minFilledFlows: 1,
  pageTitle: "Dinâmica — Método",
  reviewSelectedLabel: "Tarefas relevantes e fundamentais selecionadas",
};

const ESCOPO_QUESTION_COPY: Record<string, { title: string; helpText: string }> = {
  critical_select: {
    title: "Tarefas críticas",
    helpText: "Selecione na biblioteca as tarefas que considera críticas (cabeças) para o serviço.",
  },
  critical_rank: {
    title: "Ordem de prioridade",
    helpText: "Ordene as críticas do mais prioritário ao menos prioritário (igual ao passo 2 do participante).",
  },
  hardest_critical: {
    title: "Mais difícil entre as críticas",
    helpText: "Entre as críticas selecionadas, qual foi a mais difícil? Explique por quê.",
  },
  text_long: {
    title: "Dificuldades conceituais",
    helpText:
      "Quais foram suas dificuldades em escrever objetivos geral/específicos, pessoas do serviço e hipótese de ponto de partida?",
  },
  flow_builder_per_critical: {
    title: "Fluxos por tarefa crítica",
    helpText:
      "Para cada tarefa crítica, arraste cards do banco para os passos (pré-requisitos) até chegar na tarefa crítica.",
  },
};

const METODO_QUESTION_COPY: Record<string, { title: string; helpText: string }> = {
  critical_select: {
    title: "Tarefas fundamentais e relevantes",
    helpText:
      "Quais tarefas são as mais relevantes e fundamentais para a condução do projeto e o alinhamento com o cliente? Selecione até 10 tarefas no total.",
  },
  critical_rank: {
    title: "Ordem de relevância",
    helpText: "Ordene do mais fundamental ao menos. Avalie cada tarefa individualmente.",
  },
  hardest_critical: {
    title: "Mais difícil entre as relevantes",
    helpText:
      "Entre as tarefas que você selecionou, qual foi a mais difícil de realizar? Explique por quê.",
  },
  text_long: {
    title: "Dificuldades metodológicas",
    helpText:
      "Para cada tarefa dos chips abaixo, descreva o que foi difícil, trabalhoso ou confuso de realizar na prática.",
  },
  flow_builder_per_critical: {
    title: "Fluxos por tarefa relevante",
    helpText:
      "Para cada tarefa relevante, arraste cards do banco para montar a sequência de pré-requisitos até chegar nela.",
  },
};

function tasksFromSeedFile(filename: string): ParsedTaskLine[] {
  const file = path.join(__dirname, "../../prisma", filename);
  const raw = readFileSync(file, "utf-8");
  const out: ParsedTaskLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const p = parseTaskLine(line);
    if (p) out.push(p);
  }
  return out;
}

function versionStage(settingsJson: string | null | undefined): ResearchStage {
  try {
    const s = JSON.parse(settingsJson ?? "{}") as { researchStage?: string };
    return s.researchStage === "metodo" ? "metodo" : "escopo";
  } catch {
    return "escopo";
  }
}

/** Prefer published Escopo snapshot (ex.: v1 com 35 cards); senão seed-tasks.txt */
async function escopoTaskRows(studyId: string): Promise<{ rows: ParsedTaskLine[]; source: string }> {
  const published = await prisma.studyVersion.findMany({
    where: { studyId, isDraft: false },
    include: { tasks: { where: { inactive: false } } },
    orderBy: { number: "desc" },
  });

  const escopoVersions = published.filter((v) => versionStage(v.settingsJson) !== "metodo" && v.tasks.length > 0);
  escopoVersions.sort((a, b) => b.tasks.length - a.tasks.length);
  const best = escopoVersions[0];
  if (best) {
    return {
      source: `versão publicada v${best.number} (${best.tasks.length} cards)`,
      rows: best.tasks.map((t) => ({
        verb: t.verb,
        textoPrincipal: t.textoPrincipal,
        atividade: t.atividade,
        etapa: t.etapa,
      })),
    };
  }

  const rows = tasksFromSeedFile("seed-tasks.txt");
  return { source: `seed-tasks.txt (${rows.length} cards)`, rows };
}

function metodoTaskRows(): { rows: ParsedTaskLine[]; source: string } {
  const rows = tasksFromSeedFile("seed-tasks-metodo.txt");
  return { source: `seed-tasks-metodo.txt (${rows.length} cards)`, rows };
}

async function replaceDraftTasks(draftId: string, rows: ParsedTaskLine[]) {
  await prisma.task.deleteMany({ where: { studyVersionId: draftId } });
  for (const p of rows) {
    await prisma.task.create({
      data: {
        studyVersionId: draftId,
        verb: p.verb,
        textoPrincipal: p.textoPrincipal,
        atividade: p.atividade,
        etapa: p.etapa,
      },
    });
  }
  return rows.length;
}

async function applyQuestionCopy(draftId: string, stage: ResearchStage) {
  const copy = stage === "metodo" ? METODO_QUESTION_COPY : ESCOPO_QUESTION_COPY;
  const questions = await prisma.question.findMany({ where: { studyVersionId: draftId } });
  for (const q of questions) {
    const patch = copy[q.type];
    if (patch) {
      await prisma.question.update({
        where: { id: q.id },
        data: { title: patch.title, helpText: patch.helpText },
      });
    }
  }
}

/**
 * Carrega deck + textos + perguntas do tipo escolhido no rascunho.
 * Versões publicadas (Escopo ou Método) não são alteradas.
 */
export async function applyStageToDraft(stage: ResearchStage) {
  const study = await getOrCreateStudy();
  const draft = await ensureDraft(study.id);

  const { rows, source } = stage === "metodo" ? metodoTaskRows() : await escopoTaskRows(study.id);
  const tasksCreated = await replaceDraftTasks(draft.id, rows);

  const settingsJson = stage === "metodo" ? METODO_SETTINGS_JSON : ESCOPO_SETTINGS_JSON;
  await prisma.studyVersion.update({
    where: { id: draft.id },
    data: { settingsJson: JSON.stringify(settingsJson) },
  });

  await applyQuestionCopy(draft.id, stage);

  return { draftId: draft.id, stage, tasksCreated, taskSource: source };
}

/** @deprecated use applyStageToDraft('metodo') */
export async function loadMetodoIntoDraft() {
  return applyStageToDraft("metodo");
}
