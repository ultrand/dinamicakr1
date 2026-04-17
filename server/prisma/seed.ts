import "../src/env.js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/prisma.js";
import { publishDraft } from "../src/services/studyService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ParsedTaskLine = {
  verb: string;
  textoPrincipal: string;
  atividade: string;
  etapa: string;
};

/**
 * Formato por linha:
 * - Com TABs: `frase completa\tatividade\tetapa` → verbo = 1ª palavra, texto = resto da 1ª coluna
 * - Sem TAB (legado): só a frase → atividade/etapa vazios
 */
function parseLine(line: string): ParsedTaskLine | null {
  const t = line.trim();
  if (!t) return null;

  let phrase = t;
  let atividade = "";
  let etapa = "";

  if (t.includes("\t")) {
    const parts = t.split("\t").map((s) => s.trim());
    phrase = parts[0] ?? "";
    atividade = parts[1] ?? "";
    etapa = parts[2] ?? "";
  }

  if (!phrase) return null;
  const space = phrase.indexOf(" ");
  if (space === -1) return { verb: phrase, textoPrincipal: "", atividade, etapa };
  return {
    verb: phrase.slice(0, space),
    textoPrincipal: phrase.slice(space + 1).trim(),
    atividade,
    etapa,
  };
}

async function main() {
  let study = await prisma.study.findFirst();
  if (!study) {
    study = await prisma.study.create({ data: { name: "Dinâmica de tarefas críticas" } });
  }

  let draft = await prisma.studyVersion.findFirst({
    where: { studyId: study.id, isDraft: true },
  });
  if (!draft) {
    draft = await prisma.studyVersion.create({
      data: { studyId: study.id, number: 0, isDraft: true },
    });
  }

  const taskFile = path.join(__dirname, "seed-tasks.txt");
  const raw = readFileSync(taskFile, "utf-8");
  const lines = raw.split(/\r?\n/);

  const existingTasks = await prisma.task.count({ where: { studyVersionId: draft.id } });
  const syncDraft =
    process.env.SYNC_DRAFT_TASKS === "1" || process.env.SYNC_DRAFT_TASKS === "true";
  const shouldImport = existingTasks === 0 || syncDraft;

  if (shouldImport) {
    if (syncDraft && existingTasks > 0) {
      await prisma.task.deleteMany({ where: { studyVersionId: draft.id } });
    }
    for (const line of lines) {
      const p = parseLine(line);
      if (!p) continue;
      await prisma.task.create({
        data: {
          studyVersionId: draft.id,
          verb: p.verb,
          textoPrincipal: p.textoPrincipal,
          atividade: p.atividade,
          etapa: p.etapa,
        },
      });
    }
    if (syncDraft && existingTasks > 0) {
      console.log("Rascunho: tarefas substituídas a partir de seed-tasks.txt (SYNC_DRAFT_TASKS).");
    }
  }

  const existingQs = await prisma.question.count({ where: { studyVersionId: draft.id } });
  if (existingQs === 0) {
    const defaults = [
      {
        sortOrder: 0,
        type: "critical_select",
        title: "Tarefas críticas",
        helpText: "Selecione na biblioteca as tarefas que considera críticas (cabeças) para o serviço.",
        required: true,
      },
      {
        sortOrder: 1,
        type: "hardest_critical",
        title: "Mais difícil entre as críticas",
        helpText:
          "Entre as críticas selecionadas, qual foi a mais difícil? Por quê?",
        required: true,
      },
      {
        sortOrder: 2,
        type: "text_long",
        title: "Dificuldades conceituais",
        helpText:
          "Quais foram suas dificuldades em escrever objetivos geral/específicos, pessoas do serviço e hipótese de ponto de partida?",
        required: true,
      },
      {
        sortOrder: 3,
        type: "flow_builder_per_critical",
        title: "Fluxos por tarefa crítica",
        helpText:
          "Para cada tarefa crítica, arraste cards do banco para os passos (pré-requisitos) até chegar na tarefa crítica.",
        required: true,
      },
    ];
    for (const q of defaults) {
      await prisma.question.create({
        data: {
          studyVersionId: draft.id,
          ...q,
        },
      });
    }
  }

  /**
   * Participantes consomem só versão publicada (`/api/public/version`).
   * Após reimportar tarefas com SYNC_DRAFT_TASKS, publicamos o rascunho para
   * todas as 35 (ou N) cards aparecerem na tela sem passo manual no admin.
   */
  if (shouldImport && syncDraft) {
    await publishDraft(study.id);
    console.log(
      "Versão publicada (SYNC_DRAFT_TASKS): participantes recebem o snapshot com as tarefas do seed.",
    );
  }

  const published = await prisma.studyVersion.findFirst({
    where: { studyId: study.id, isDraft: false },
  });
  if (!published) {
    await publishDraft(study.id);
    console.log("Versão inicial publicada.");
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
