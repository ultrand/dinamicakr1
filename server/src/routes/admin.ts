import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { ensureDraft, getDraftVersion, getOrCreateStudy, publishDraft } from "../services/studyService.js";
import { taskHasResponses } from "../services/taskUsage.js";
import { buildAnalytics } from "../services/analyticsService.js";

export const adminRouter = Router();
adminRouter.use(adminAuth);

adminRouter.get("/overview", async (_req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const published = await prisma.studyVersion.findMany({
      where: { studyId: study.id, isDraft: false },
      orderBy: { number: "desc" },
      select: { id: true, number: true, publishedAt: true, _count: { select: { responses: true } } },
    });
    const draftFull = await prisma.studyVersion.findUnique({
      where: { id: draft.id },
      include: {
        tasks: { orderBy: { textoPrincipal: "asc" } },
        questions: { orderBy: { sortOrder: "asc" } },
      },
    });
    res.json({ study, draft: draftFull, publishedVersions: published });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.post("/publish", async (_req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await getDraftVersion(study.id);
    if (!draft) {
      res.status(400).json({ error: "Sem rascunho" });
      return;
    }
    const taskCount = await prisma.task.count({ where: { studyVersionId: draft.id } });
    const qCount = await prisma.question.count({ where: { studyVersionId: draft.id } });
    if (taskCount === 0 || qCount === 0) {
      res.status(400).json({ error: "Rascunho precisa de cards e perguntas" });
      return;
    }
    const result = await publishDraft(study.id);
    res.json({
      published: {
        id: result.published.id,
        number: result.published.number,
        publishedAt: result.published.publishedAt,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Falha ao publicar" });
  }
});

adminRouter.get("/tasks", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const tasks = await prisma.task.findMany({
      where: {
        studyVersionId: draft.id,
        ...(q
          ? {
              OR: [
                { verb: { contains: q } },
                { textoPrincipal: { contains: q } },
                { atividade: { contains: q } },
                { etapa: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { textoPrincipal: "asc" },
    });
    const usage = await Promise.all(
      tasks.map(async (t) => ({ id: t.id, hasResponses: await taskHasResponses(t.id) })),
    );
    const usageMap = Object.fromEntries(usage.map((u) => [u.id, u.hasResponses]));
    res.json({ tasks: tasks.map((t) => ({ ...t, hasResponses: usageMap[t.id] })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.patch("/tasks/:id", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, studyVersionId: draft.id },
    });
    if (!task) {
      res.status(404).json({ error: "Card não encontrado no rascunho" });
      return;
    }
    const { verb, textoPrincipal, atividade, etapa, inactive } = req.body as Record<string, unknown>;
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        ...(typeof verb === "string" ? { verb } : {}),
        ...(typeof textoPrincipal === "string" ? { textoPrincipal } : {}),
        ...(typeof atividade === "string" ? { atividade } : {}),
        ...(typeof etapa === "string" ? { etapa } : {}),
        ...(typeof inactive === "boolean" ? { inactive } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.post("/tasks/bulk", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const raw = String((req.body as { text?: string }).text ?? "");
    const lines = raw.split(/\r?\n/);
    const created: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const space = t.indexOf(" ");
      const verb = space === -1 ? t : t.slice(0, space);
      const textoPrincipal = space === -1 ? "" : t.slice(space + 1).trim();
      const row = await prisma.task.create({
        data: {
          studyVersionId: draft.id,
          verb,
          textoPrincipal,
          atividade: "",
          etapa: "",
        },
      });
      created.push(row.id);
    }
    res.json({ created: created.length, ids: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.post("/tasks", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const { verb, textoPrincipal, atividade, etapa } = req.body as Record<string, string>;
    if (!verb?.trim() || textoPrincipal === undefined) {
      res.status(400).json({ error: "verb e textoPrincipal obrigatórios" });
      return;
    }
    const row = await prisma.task.create({
      data: {
        studyVersionId: draft.id,
        verb: verb.trim(),
        textoPrincipal: textoPrincipal.trim(),
        atividade: (atividade ?? "").trim(),
        etapa: (etapa ?? "").trim(),
      },
    });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.delete("/tasks/:id", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, studyVersionId: draft.id },
    });
    if (!task) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    if (await taskHasResponses(task.id)) {
      res.status(409).json({ error: "Card já usado em respostas — use Arquivar" });
      return;
    }
    await prisma.task.delete({ where: { id: task.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

const Q_TYPES = new Set(["critical_select", "critical_rank", "hardest_critical", "text_long", "flow_builder_per_critical"]);

adminRouter.post("/questions", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const { type, title, helpText, required, sortOrder } = req.body as Record<string, unknown>;
    if (!Q_TYPES.has(String(type))) {
      res.status(400).json({ error: "Tipo inválido" });
      return;
    }
    const max = await prisma.question.aggregate({
      where: { studyVersionId: draft.id },
      _max: { sortOrder: true },
    });
    const row = await prisma.question.create({
      data: {
        studyVersionId: draft.id,
        sortOrder: typeof sortOrder === "number" ? sortOrder : (max._max.sortOrder ?? -1) + 1,
        type: String(type),
        title: String(title ?? ""),
        helpText: String(helpText ?? ""),
        required: required !== false,
      },
    });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.patch("/questions/:id", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const q = await prisma.question.findFirst({
      where: { id: req.params.id, studyVersionId: draft.id },
    });
    if (!q) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    const { title, helpText, required, type } = req.body as Record<string, unknown>;
    if (type !== undefined && !Q_TYPES.has(String(type))) {
      res.status(400).json({ error: "Tipo inválido" });
      return;
    }
    const updated = await prisma.question.update({
      where: { id: q.id },
      data: {
        ...(typeof title === "string" ? { title } : {}),
        ...(typeof helpText === "string" ? { helpText } : {}),
        ...(typeof required === "boolean" ? { required } : {}),
        ...(type !== undefined ? { type: String(type) } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.put("/questions/reorder", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const ids = (req.body as { orderedIds?: string[] }).orderedIds;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: "orderedIds obrigatório" });
      return;
    }
    await prisma.$transaction(
      ids.map((id, i) =>
        prisma.question.updateMany({
          where: { id, studyVersionId: draft.id },
          data: { sortOrder: i },
        }),
      ),
    );
    const list = await prisma.question.findMany({
      where: { studyVersionId: draft.id },
      orderBy: { sortOrder: "asc" },
    });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.delete("/questions/:id", async (req, res) => {
  try {
    const study = await getOrCreateStudy();
    const draft = await ensureDraft(study.id);
    const q = await prisma.question.findFirst({
      where: { id: req.params.id, studyVersionId: draft.id },
    });
    if (!q) {
      res.status(404).json({ error: "Não encontrado" });
      return;
    }
    await prisma.question.delete({ where: { id: q.id } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.get("/analytics", async (req, res) => {
  try {
    const versionId = typeof req.query.versionId === "string" ? req.query.versionId : undefined;
    const criticalTaskId =
      typeof req.query.criticalTaskId === "string" && req.query.criticalTaskId
        ? req.query.criticalTaskId
        : undefined;
    if (!versionId) {
      res.status(400).json({ error: "versionId obrigatório" });
      return;
    }
    const v = await prisma.studyVersion.findFirst({
      where: { id: versionId, isDraft: false },
    });
    if (!v) {
      res.status(404).json({ error: "Versão inválida" });
      return;
    }
    const data = await buildAnalytics(versionId, criticalTaskId ?? null);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.get("/export/csv", async (req, res) => {
  try {
    const versionId = typeof req.query.versionId === "string" ? req.query.versionId : undefined;
    if (!versionId) {
      res.status(400).json({ error: "versionId obrigatório" });
      return;
    }
    const steps = await prisma.pathStep.findMany({
      where: { path: { response: { studyVersionId: versionId } } },
      include: {
        path: { select: { criticalTaskId: true, responseId: true } },
      },
      orderBy: [{ pathId: "asc" }, { stepIndex: "asc" }],
    });
    const lines = ["response_id,critical_task_id,step_index,task_id"];
    for (const s of steps) {
      lines.push(
        `${s.path.responseId},${s.path.criticalTaskId},${s.stepIndex},${s.taskId}`,
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="paths-${versionId}.csv"`);
    res.send(lines.join("\n"));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.get("/export/json", async (req, res) => {
  try {
    const versionId = typeof req.query.versionId === "string" ? req.query.versionId : undefined;
    if (!versionId) {
      res.status(400).json({ error: "versionId obrigatório" });
      return;
    }
    const paths = await prisma.path.findMany({
      where: { response: { studyVersionId: versionId } },
      include: {
        steps: { orderBy: { stepIndex: "asc" } },
      },
    });
    const byResponse: Record<string, Record<string, string[]>> = {};
    for (const p of paths) {
      if (!byResponse[p.responseId]) byResponse[p.responseId] = {};
      byResponse[p.responseId]![p.criticalTaskId] = p.steps.map((s) => s.taskId);
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="responses-${versionId}.json"`);
    res.json(byResponse);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});

adminRouter.get("/versions", async (_req, res) => {
  try {
    const study = await getOrCreateStudy();
    const list = await prisma.studyVersion.findMany({
      where: { studyId: study.id, isDraft: false },
      orderBy: { number: "desc" },
      select: {
        id: true,
        number: true,
        publishedAt: true,
        _count: { select: { responses: true } },
      },
    });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro" });
  }
});
