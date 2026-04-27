import { prisma } from "../lib/prisma.js";

let ensureCompatPromise: Promise<void> | null = null;

async function ensureSchemaCompat() {
  if (!ensureCompatPromise) {
    ensureCompatPromise = (async () => {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "StudyVersion" ADD COLUMN IF NOT EXISTS "label" TEXT NOT NULL DEFAULT \'\'',
      );
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Path" ADD COLUMN IF NOT EXISTS "comment" TEXT NOT NULL DEFAULT \'\'',
      );
    })().catch((error) => {
      ensureCompatPromise = null;
      throw error;
    });
  }
  await ensureCompatPromise;
}

export async function getOrCreateStudy() {
  await ensureSchemaCompat();
  let study = await prisma.study.findFirst();
  if (!study) {
    study = await prisma.study.create({
      data: { name: "Dinâmica de tarefas críticas" },
    });
  }
  return study;
}

export async function getDraftVersion(studyId: string) {
  const draft = await prisma.studyVersion.findFirst({
    where: { studyId, isDraft: true },
  });
  return draft;
}

export async function getLatestPublishedVersion(studyId: string) {
  return prisma.studyVersion.findFirst({
    where: { studyId, isDraft: false },
    orderBy: { number: "desc" },
  });
}

export async function ensureDraft(studyId: string) {
  const existing = await getDraftVersion(studyId);
  if (existing) return existing;
  return prisma.studyVersion.create({
    data: {
      studyId,
      number: 0,
      isDraft: true,
    },
  });
}

/** Copia rascunho para nova versão publicada (imutável). Rascunho permanece editável. */
export async function publishDraft(studyId: string, metadata?: { label?: string }) {
  const draft = await getDraftVersion(studyId);
  if (!draft) throw new Error("Rascunho não encontrado");

  const maxPub = await prisma.studyVersion.aggregate({
    where: { studyId, isDraft: false },
    _max: { number: true },
  });
  const newNumber = (maxPub._max.number ?? 0) + 1;

  const draftTasks = await prisma.task.findMany({
    where: { studyVersionId: draft.id },
  });
  const draftQuestions = await prisma.question.findMany({
    where: { studyVersionId: draft.id },
    orderBy: { sortOrder: "asc" },
  });

  const published = await prisma.$transaction(async (tx) => {
    const v = await tx.studyVersion.create({
      data: {
        studyId,
        number: newNumber,
        isDraft: false,
        publishedAt: new Date(),
        label: (metadata?.label ?? "").trim(),
      },
    });

    for (const t of draftTasks) {
      await tx.task.create({
        data: {
          studyVersionId: v.id,
          verb: t.verb,
          textoPrincipal: t.textoPrincipal,
          atividade: t.atividade,
          etapa: t.etapa,
          inactive: t.inactive,
        },
      });
    }

    for (const q of draftQuestions) {
      await tx.question.create({
        data: {
          studyVersionId: v.id,
          sortOrder: q.sortOrder,
          type: q.type,
          title: q.title,
          helpText: q.helpText,
          required: q.required,
        },
      });
    }

    return v;
  }, { maxWait: 10_000, timeout: 60_000 });

  const publishedWith = await prisma.studyVersion.findUnique({
    where: { id: published.id },
    include: {
      tasks: { where: { inactive: false } },
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  return { published: publishedWith! };
}

/** Duplica conteúdo da última publicação para o rascunho (quando rascunho está vazio após primeiro setup). Opcional — não usado se seed já preenche rascunho. */
export async function copyPublishedToDraft(studyId: string) {
  const latest = await getLatestPublishedVersion(studyId);
  if (!latest) return null;
  const draft = await ensureDraft(studyId);
  const existingTasks = await prisma.task.count({ where: { studyVersionId: draft.id } });
  if (existingTasks > 0) return draft;

  const tasks = await prisma.task.findMany({ where: { studyVersionId: latest.id } });
  const questions = await prisma.question.findMany({
    where: { studyVersionId: latest.id },
    orderBy: { sortOrder: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    for (const t of tasks) {
      await tx.task.create({
        data: {
          studyVersionId: draft.id,
          verb: t.verb,
          textoPrincipal: t.textoPrincipal,
          atividade: t.atividade,
          etapa: t.etapa,
          inactive: t.inactive,
        },
      });
    }
    for (const q of questions) {
      await tx.question.create({
        data: {
          studyVersionId: draft.id,
          sortOrder: q.sortOrder,
          type: q.type,
          title: q.title,
          helpText: q.helpText,
          required: q.required,
        },
      });
    }
  }, { maxWait: 10_000, timeout: 60_000 });

  return draft;
}
