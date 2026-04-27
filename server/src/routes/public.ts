import { Router, type Request } from "express";
import { prisma } from "../lib/prisma.js";
import { getLatestPublishedVersion, getOrCreateStudy } from "../services/studyService.js";

export const publicRouter = Router();

const responseRateLimit = new Map<string, { count: number; resetAt: number }>();

function rateLimitKey(req: Request) {
  return req.ip || req.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = responseRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    responseRateLimit.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

function parseSettingsMin(raw: string | undefined) {
  try {
    const parsed = raw ? JSON.parse(raw) as { minCriticalSelected?: number; minFilledFlows?: number } : {};
    return {
      minCriticalSelected: Math.max(1, Number(parsed.minCriticalSelected ?? 1) || 1),
      minFilledFlows: Math.max(1, Number(parsed.minFilledFlows ?? 1) || 1),
    };
  } catch {
    return { minCriticalSelected: 1, minFilledFlows: 1 };
  }
}

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
    res.status(500).json({ error: "Falha ao carregar versão" });
  }
});

type AnswerIn = {
  questionId: string;
  criticalTaskIds?: string[];
  orderedCriticalTaskIds?: string[];  // critical_rank: ranking completo
  taskId?: string;
  why?: string;
  text?: string;
  flows?: { criticalTaskId: string; stepTaskIds: string[]; comment?: string }[];
};

function hasDuplicates(values: string[] | undefined) {
  return Array.isArray(values) && new Set(values).size !== values.length;
}

publicRouter.post("/responses", async (req, res) => {
  try {
    if (isRateLimited(rateLimitKey(req))) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." });
      return;
    }
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
    const minima = parseSettingsMin(version.settingsJson);
    const qMap = new Map(questions.map((q) => [q.id, q]));

    const invalidQuestionId = answers.find((a) => !qMap.has(a.questionId));
    if (invalidQuestionId) {
      res.status(400).json({ error: "Resposta enviada para pergunta inexistente nesta versão" });
      return;
    }

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
        if ((a.criticalTaskIds?.length ?? 0) < minima.minCriticalSelected) {
          res.status(400).json({ error: `Selecione ao menos ${minima.minCriticalSelected} tarefa(s) crítica(s)` });
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
        const filledCount = (a.flows ?? []).filter((f) => f.stepTaskIds.length > 0).length;
        if (filledCount < minima.minFilledFlows) {
          res.status(400).json({ error: `Preencha ao menos ${minima.minFilledFlows} fluxo(s)` });
          return;
        }
      }
    }

    const criticalQ = questions.find((q) => q.type === "critical_select");
    const selected = answers.find((x) => x.questionId === criticalQ?.id)?.criticalTaskIds ?? [];
    if (hasDuplicates(selected)) {
      res.status(400).json({ error: "Seleção contém cards duplicados" });
      return;
    }
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
    if (hasDuplicates(orderedIds)) {
      res.status(400).json({ error: "Ranking contém cards duplicados" });
      return;
    }
    for (const tid of orderedIds) {
      if (!taskIds.has(tid)) {
        res.status(400).json({ error: "Card inválido no ranking" });
        return;
      }
      if (selectedSet.size > 0 && !selectedSet.has(tid)) {
        res.status(400).json({ error: "Ranking deve usar apenas tarefas críticas selecionadas" });
        return;
      }
    }
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
        if (hasDuplicates(f.stepTaskIds)) {
          res.status(400).json({ error: "Fluxo contém cards duplicados" });
          return;
        }
        for (const tid of f.stepTaskIds) {
          if (!taskIds.has(tid)) {
            res.status(400).json({ error: "Card inválido no fluxo" });
            return;
          }
        }
      }
    }

    const response = await prisma.$transaction(async (tx) => {
      const r = await tx.response.create({
        data: { studyVersionId },
      });

      for (const a of answers) {
        const q = qMap.get(a.questionId);
        if (!q) throw new Error("question");

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
                comment: (flow.comment ?? "").trim(),
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
