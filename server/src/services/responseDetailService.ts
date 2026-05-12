import { prisma } from "../lib/prisma.js";

function taskLabel(t: { verb: string; textoPrincipal: string }) {
  return `${(t.verb ?? "").toUpperCase()} ${t.textoPrincipal}`.trim();
}

/** Ordem exibida na seleção: igual ao passo 2 quando há CriticalRank; senão alfabética estável. */
function buildOrderedCriticalSelections(
  selections: { taskId: string }[],
  ranks: { taskId: string; position: number }[],
  tidToLabel: (id: string) => string,
): {
  tasks: { id: string; label: string; order: number }[];
  selectionOrderSource: "passo2" | "alfabetica_sem_ranking";
} {
  const selUnique: string[] = [];
  const seen = new Set<string>();
  for (const s of selections) {
    if (!seen.has(s.taskId)) {
      seen.add(s.taskId);
      selUnique.push(s.taskId);
    }
  }

  const rankForSelected = ranks
    .filter((row) => seen.has(row.taskId))
    .sort((a, b) => a.position - b.position);
  const inRankOrder = rankForSelected.map((r) => r.taskId);
  const inRankSet = new Set(inRankOrder);
  const notInRank = selUnique.filter((id) => !inRankSet.has(id));

  const usePasso2 = inRankOrder.length > 0;
  const merged = usePasso2
    ? [...inRankOrder, ...notInRank]
    : [...selUnique].sort((a, b) => tidToLabel(a).localeCompare(tidToLabel(b), "pt"));

  return {
    tasks: merged.map((id, i) => ({
      id,
      label: tidToLabel(id),
      order: i + 1,
    })),
    selectionOrderSource: usePasso2 ? "passo2" : "alfabetica_sem_ranking",
  };
}

export type ResponseDetailBlock =
  | {
      questionId: string;
      type: "critical_select";
      title: string;
      helpText: string;
      tasks: { id: string; label: string; order: number }[];
      selectionOrderSource: "passo2" | "alfabetica_sem_ranking";
    }
  | {
      questionId: string;
      type: "critical_rank";
      title: string;
      helpText: string;
      ordered: { position: number; id: string; label: string }[];
    }
  | {
      questionId: string;
      type: "hardest_critical";
      title: string;
      helpText: string;
      task: { id: string; label: string } | null;
      whyText: string;
    }
  | {
      questionId: string;
      type: "text_long";
      title: string;
      helpText: string;
      text: string;
    }
  | {
      questionId: string;
      type: "flow_builder_per_critical";
      title: string;
      helpText: string;
      flows: {
        criticalTaskId: string;
        criticalLabel: string;
        steps: { id: string; label: string }[];
        comment: string;
      }[];
    }
  | {
      questionId: string;
      type: "unknown_question_type";
      title: string;
      helpText: string;
      note: string;
    };

export async function buildResponsesDetail(studyVersionId: string) {
  const [questions, tasks, responses] = await Promise.all([
    prisma.question.findMany({
      where: { studyVersionId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, type: true, title: true, helpText: true },
    }),
    prisma.task.findMany({
      where: { studyVersionId },
      select: { id: true, verb: true, textoPrincipal: true },
    }),
    prisma.response.findMany({
      where: { studyVersionId },
      orderBy: { createdAt: "asc" },
      include: {
        criticalSelections: true,
        criticalRanks: { orderBy: { position: "asc" } },
        criticalDifficulty: true,
        conceptualDifficulties: {
          include: { question: { select: { id: true, type: true, title: true } } },
        },
        paths: {
          include: {
            steps: {
              orderBy: { stepIndex: "asc" },
              include: { task: { select: { id: true, verb: true, textoPrincipal: true } } },
            },
          },
        },
      },
    }),
  ]);

  const tidToLabel = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    return t ? taskLabel(t) : id;
  };

  const detailRows = responses.map((r) => {
    const blocks: ResponseDetailBlock[] = [];

    for (const q of questions) {
      const title = q.title;
      const helpText = q.helpText ?? "";

      if (q.type === "critical_select") {
        const { tasks: tasksSel, selectionOrderSource } = buildOrderedCriticalSelections(
          r.criticalSelections,
          r.criticalRanks,
          tidToLabel,
        );
        blocks.push({
          questionId: q.id,
          type: "critical_select",
          title,
          helpText,
          tasks: tasksSel,
          selectionOrderSource,
        });
        continue;
      }

      if (q.type === "critical_rank") {
        const ordered = r.criticalRanks.map((row) => ({
          position: row.position,
          id: row.taskId,
          label: tidToLabel(row.taskId),
        }));
        blocks.push({
          questionId: q.id,
          type: "critical_rank",
          title,
          helpText,
          ordered,
        });
        continue;
      }

      if (q.type === "hardest_critical") {
        const cd = r.criticalDifficulty;
        const task = cd ? { id: cd.taskId, label: tidToLabel(cd.taskId) } : null;
        blocks.push({
          questionId: q.id,
          type: "hardest_critical",
          title,
          helpText,
          task,
          whyText: cd?.whyText?.trim() ?? "",
        });
        continue;
      }

      if (q.type === "text_long") {
        const row = r.conceptualDifficulties.find((c) => c.questionId === q.id);
        blocks.push({
          questionId: q.id,
          type: "text_long",
          title,
          helpText,
          text: row?.text?.trim() ?? "",
        });
        continue;
      }

      if (q.type === "flow_builder_per_critical") {
        const flows = r.paths.map((p) => ({
          criticalTaskId: p.criticalTaskId,
          criticalLabel: tidToLabel(p.criticalTaskId),
          steps: p.steps.map((s) => ({
            id: s.taskId,
            label: s.task ? taskLabel(s.task) : tidToLabel(s.taskId),
          })),
          comment: p.comment?.trim() ?? "",
        }));
        blocks.push({
          questionId: q.id,
          type: "flow_builder_per_critical",
          title,
          helpText,
          flows,
        });
        continue;
      }

      blocks.push({
        questionId: q.id,
        type: "unknown_question_type",
        title,
        helpText,
        note: `Tipo "${q.type}" não mapeado para esta visualização.`,
      });
    }

    return {
      id: r.id,
      createdAt: r.createdAt,
      participantName: (r.participantName ?? "").trim(),
      blocks,
    };
  });

  return {
    studyVersionId,
    questions: questions.map((q) => ({
      id: q.id,
      sortOrder: q.sortOrder,
      type: q.type,
      title: q.title,
      helpText: q.helpText,
    })),
    responses: detailRows,
  };
}
