import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { getLatestPublishedVersion, getOrCreateStudy } from "../services/studyService.js";

export const publicRouter = Router();

publicRouter.get("/version", async (_req, res) => {
  try {
    const study = await getOrCreateStudy();
    const v = await getLatestPublishedVersion(study.id);
    if (!v) {
      res.json({ studyId: study.id, version: null });
      return;
    }
    const full = await prisma.studyVersion.findUnique({
      where: { id: v.id },
      include: {
        tasks: {
          where: { inactive: false },
          orderBy: { textoPrincipal: "asc" },
        },
        questions: { orderBy: { sortOrder: "asc" } },
      },
    });
    res.json({ studyId: study.id, version: full });
  } catch (e) {
    console.error("[/version error]", e);
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Falha ao carregar versão", details: msg });
  }
});

type AnswerIn = {
  questionId: string;
  criticalTaskIds?: string[];
  orderedCriticalTaskIds?: string[];  // critical_rank: ranking completo
  taskId?: string;
  why?: string;
  text?: string;
  flows?: { criticalTaskId: string; stepTaskIds: string[] }[];
};

publicRouter.post("/responses", async (req, res) => {
  try {
    const { studyVersionId, answers } = req.body as {
      studyVersionId: string;
      answers: AnswerIn[];
    };
    if (!studyVersionId || !Array.isArray(answers)) {
      res.status(400).json({ error: "Payload inválido" });
      return;
    }

    const qids = answers.map((a) => a.questionId);
    if (new Set(qids).size !== qids.length) {
      res.status(400).json({ error: "questionId duplicado nas respostas" });
      return;
    }

    const version = await prisma.studyVersion.findFirst({
      where: { id: studyVersionId, isDraft: false },
    });
    if (!version) {
      res.status(400).json({ error: "Versão não publicada ou inexistente" });
      return;
    }

    const questions = await prisma.question.findMany({
      where: { studyVersionId },
      orderBy: { sortOrder: "asc" },
    });
    const qMap = new Map(questions.map((q) => [q.id, q]));

    const taskIds = new Set(
      (await prisma.task.findMany({ where: { studyVersionId }, select: { id: true } })).map((t) => t.id),
    );

    for (const q of questions) {
      if (!q.required) continue;
      const a = answers.find((x) => x.questionId === q.id);
      if (!a) {
        res.status(400).json({ error: `Resposta obrigatória ausente: ${q.title}` });
        return;
      }
      if (q.type === "critical_select") {
        if (!a.criticalTaskIds?.length) {
          res.status(400).json({ error: "Selecione ao menos uma tarefa crítica" });
          return;
        }
      }
      if (q.type === "hardest_critical") {
        if (!a.taskId || !(a.why ?? "").trim()) {
          res.status(400).json({ error: "Preencha a tarefa mais difícil e o motivo" });
          return;
        }
      }
      if (q.type === "text_long") {
        if (!(a.text ?? "").trim()) {
          res.status(400).json({ error: "Texto obrigatório" });
          return;
        }
      }
      if (q.type === "critical_rank") {
        if (!a.orderedCriticalTaskIds?.length) {
          res.status(400).json({ error: "Ranking das tarefas críticas obrigatório" });
          return;
        }
      }
      if (q.type === "flow_builder_per_critical") {
        // fluxo: exige ao menos 1 preenchido entre os top-5
        const hasAny = (a.flows ?? []).some((f) => f.stepTaskIds.length > 0);
        if (!hasAny) {
          res.status(400).json({ error: "Preencha o fluxo de ao menos uma tarefa crítica" });
          return;
        }
      }
    }

    const criticalQ = questions.find((q) => q.type === "critical_select");
    const selected = answers.find((x) => x.questionId === criticalQ?.id)?.criticalTaskIds ?? [];
    for (const tid of selected) {
      if (!taskIds.has(tid)) {
        res.status(400).json({ error: "Card inválido na seleção" });
        return;
      }
    }

    const selectedSet = new Set(selected);
    const hardestQ = questions.find((q) => q.type === "hardest_critical");
    const hardestAns = answers.find((x) => x.questionId === hardestQ?.id);
    if (hardestAns?.taskId && !selectedSet.has(hardestAns.taskId)) {
      res.status(400).json({ error: "A tarefa mais difícil deve estar entre as críticas selecionadas" });
      return;
    }

    // Deriva top5 a partir do ranking (critical_rank), ou fallback para selected
    const rankQ = questions.find((q) => q.type === "critical_rank");
    const rankAns = answers.find((x) => x.questionId === rankQ?.id);
    const orderedIds = rankAns?.orderedCriticalTaskIds ?? selected;
    const top5Set = new Set(orderedIds.slice(0, 5));

    const flowQ = questions.find((q) => q.type === "flow_builder_per_critical");
    const flowAns = answers.find((x) => x.questionId === flowQ?.id);
    if (flowAns?.flows?.length) {
      for (const f of flowAns.flows) {
        // só valida fluxos de críticas do top5 (ignora extra)
        if (!top5Set.has(f.criticalTaskId) && !selectedSet.has(f.criticalTaskId)) {
          res.status(400).json({ error: "Fluxos só podem usar críticas selecionadas" });
          return;
        }
      }
    }

    const response = await prisma.$transaction(async (tx) => {
      const r = await tx.response.create({
        data: { studyVersionId },
      });

      for (const a of answers) {
        const q = qMap.get(a.questionId);
        if (!q) continue;

        if (q.type === "critical_select" && a.criticalTaskIds) {
          for (const tid of a.criticalTaskIds) {
            if (!taskIds.has(tid)) throw new Error("task");
            await tx.criticalSelection.create({
              data: { responseId: r.id, taskId: tid },
            });
          }
        }

        if (q.type === "hardest_critical" && a.taskId) {
          if (!taskIds.has(a.taskId)) throw new Error("task");
          await tx.criticalDifficulty.create({
            data: {
              responseId: r.id,
              taskId: a.taskId,
              whyText: (a.why ?? "").trim(),
            },
          });
        }

        if (q.type === "critical_rank" && a.orderedCriticalTaskIds) {
          for (let i = 0; i < a.orderedCriticalTaskIds.length; i++) {
            const tid = a.orderedCriticalTaskIds[i]!;
            if (!taskIds.has(tid)) throw new Error("task");
            await tx.criticalRank.create({
              data: { responseId: r.id, taskId: tid, position: i + 1 },
            });
          }
        }

        if (q.type === "text_long") {
          await tx.conceptualDifficulty.create({
            data: {
              responseId: r.id,
              questionId: q.id,
              text: (a.text ?? "").trim(),
            },
          });
        }

        if (q.type === "flow_builder_per_critical" && a.flows) {
          for (const flow of a.flows) {
            if (!taskIds.has(flow.criticalTaskId)) throw new Error("crit");
            const path = await tx.path.create({
              data: {
                responseId: r.id,
                criticalTaskId: flow.criticalTaskId,
              },
            });
            for (const tid of flow.stepTaskIds) {
              if (!taskIds.has(tid)) throw new Error("step");
            }
            for (let i = 0; i < flow.stepTaskIds.length; i++) {
              await tx.pathStep.create({
                data: {
                  pathId: path.id,
                  stepIndex: i,
                  taskId: flow.stepTaskIds[i]!,
                },
              });
            }
          }
        }
      }

      return r;
    });

    res.json({ id: response.id, ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível salvar" });
  }
});
