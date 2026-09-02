export type ResearchStage = "escopo" | "metodo";

export type DynamicSettings = {
  researchStage: ResearchStage;
  stepLabels: [string, string, string, string, string];
  step1Title: string;
  step1Sub: string;
  step2Title: string;
  step2Sub: string;
  step3Title: string;
  step3Sub: string;
  step4Title: string;
  step4Sub: string;
  step5Title: string;
  step5Sub: string;
  minCriticalSelected: number;
  /** Máximo total de seleções no passo 1 (todas as etapas juntas). null = sem limite total. */
  maxCriticalSelected: number | null;
  /** Legado/opcional: limite por grupo (etapa). null = sem limite por grupo. */
  maxCriticalPerGroup: number | null;
  minFilledFlows: number;
  pageTitle: string;
  reviewSelectedLabel: string;
};

export const ESCOPO_SETTINGS: DynamicSettings = {
  researchStage: "escopo",
  stepLabels: ["Seleção", "Ranking", "Perguntas", "Fluxos", "Revisão"],
  step1Title: "Selecione as tarefas críticas",
  step1Sub: "Marque as tarefas indispensáveis para o serviço.",
  step2Title: "Ordene por prioridade",
  step2Sub: "Arraste ou use ↑↓ do mais crítico ao menos crítico.",
  step3Title: "Perguntas sobre o método",
  step3Sub:
    "Entre as tarefas que você selecionou, indique a mais difícil e explique por quê. Nos tópicos listados abaixo, descreva as dificuldades que teve em cada um e explique por quê.",
  step4Title: "Monte os fluxos de tarefas",
  step4Sub: "Indique a sequência de passos que leva à tarefa crítica. Arraste do banco ou clique em + para adicionar.",
  step5Title: "Revise e envie",
  step5Sub: "Confirme antes de submeter.",
  minCriticalSelected: 1,
  maxCriticalSelected: null,
  maxCriticalPerGroup: null,
  minFilledFlows: 1,
  pageTitle: "Dinâmica — Tarefas críticas",
  reviewSelectedLabel: "Tarefas críticas selecionadas",
};

export const METODO_SETTINGS: DynamicSettings = {
  researchStage: "metodo",
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

/** Help do bloco inferior do passo 3 (Método). */
export const METODO_TEXT_LONG_HELP =
  "Para cada tarefa dos chips abaixo, descreva o que foi difícil, trabalhoso ou confuso de realizar na prática.";

/** Passo 3 (Método): chips fixos de dificuldades em recorte amostral — ordem de exibição. */
export const METODO_DIFFICULTY_PROMPTS = [
  "Estruturar tabela de screening",
  "Definir perfis generalistas de indivíduos",
  "Definir características e critérios",
  "Definir tamanho da amostra",
] as const;

export function normalizeTaskText(text: string): string {
  return text.trim().toLowerCase();
}

function taskPhraseKey(t: { verb?: string; textoPrincipal?: string }): string {
  const verb = (t.verb ?? "").trim();
  const body = (t.textoPrincipal ?? "").trim();
  return normalizeTaskText(verb && body ? `${verb} ${body}` : body || verb);
}

export function findTaskByPromptLabel(
  taskById: Map<string, { id: string; verb?: string; textoPrincipal?: string; atividade?: string; etapa?: string }>,
  label: string,
) {
  const key = normalizeTaskText(label);
  for (const t of taskById.values()) {
    if (taskPhraseKey(t) === key) return t;
  }
  return undefined;
}

/** Formato inserido ao clicar num chip do passo 3. */
export function promptLineMarker(label: string): string {
  return `- ${label} -`;
}

const PROMPT_ANSWER_MIN = 3;
const FREEFORM_MIN = 15;

/** Exige texto de verdade — não basta só o marcador `- tarefa -` do chip. */
export function validatePromptLongText(text: string, promptLabels: readonly string[]): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (promptLabels.length === 0) return trimmed.length >= PROMPT_ANSWER_MIN;

  const usesMarkers = promptLabels.some((label) => trimmed.includes(promptLineMarker(label)));
  if (!usesMarkers) return trimmed.length >= FREEFORM_MIN;

  for (const label of promptLabels) {
    const marker = promptLineMarker(label);
    if (!trimmed.includes(marker)) return false;

    let answered = false;
    for (const line of trimmed.split("\n")) {
      const idx = line.indexOf(marker);
      if (idx >= 0 && line.slice(idx + marker.length).trim().length >= PROMPT_ANSWER_MIN) {
        answered = true;
        break;
      }
    }
    if (!answered) return false;
  }
  return true;
}

/** Chips fixos do passo 3 (Método), exceto a tarefa já marcada como mais difícil acima. */
export function metodoDifficultyPromptLabels(
  taskById: Map<string, { id: string; verb?: string; textoPrincipal?: string }>,
  hardestId: string | null,
): string[] {
  const hardest = hardestId ? taskById.get(hardestId) : undefined;
  const hardestKey = hardest ? taskPhraseKey(hardest) : "";
  return METODO_DIFFICULTY_PROMPTS.filter(
    (label) => normalizeTaskText(label) !== hardestKey,
  );
}

export function templateForStage(stage: ResearchStage): DynamicSettings {
  return stage === "metodo" ? { ...METODO_SETTINGS } : { ...ESCOPO_SETTINGS };
}

/** Remove complemento legado após travessão (ex.: referência ao passo Fluxos). */
function trimAfterEmDash(text: string): string {
  const em = text.indexOf(" — ");
  if (em >= 0) {
    const tail = text.slice(em + 3).toLowerCase();
    if (
      tail.includes("passo fluxos")
      || tail.includes("mais adiante")
      || tail.includes("você fará")
      || tail.includes("voce fara")
    ) {
      return text.slice(0, em).trim();
    }
  }
  const hyphen = text.indexOf(" - ");
  if (hyphen >= 0) {
    const tail = text.slice(hyphen + 3).toLowerCase();
    if (tail.includes("passo fluxos") || tail.includes("mais adiante")) {
      return text.slice(0, hyphen).trim();
    }
  }
  return text.trim();
}

function sanitizeWizardCopy(settings: DynamicSettings): DynamicSettings {
  return {
    ...settings,
    step1Sub: trimAfterEmDash(settings.step1Sub),
    step2Sub: trimAfterEmDash(settings.step2Sub),
    step3Sub: trimAfterEmDash(settings.step3Sub),
    step4Sub: trimAfterEmDash(settings.step4Sub),
    step5Sub: trimAfterEmDash(settings.step5Sub),
  };
}

export function parseDynamicSettings(raw: string | undefined): DynamicSettings {
  if (!raw) return sanitizeWizardCopy({ ...ESCOPO_SETTINGS });
  try {
    const parsed = JSON.parse(raw) as Partial<DynamicSettings> & { researchStage?: string };
    const stage: ResearchStage = parsed.researchStage === "metodo" ? "metodo" : "escopo";
    const base = templateForStage(stage);
    let maxPerGroup = base.maxCriticalPerGroup;
    if (parsed.maxCriticalPerGroup === null) maxPerGroup = null;
    else if (parsed.maxCriticalPerGroup !== undefined) {
      maxPerGroup = Math.max(1, Number(parsed.maxCriticalPerGroup) || 1);
    }
    let maxTotal = base.maxCriticalSelected;
    if (parsed.maxCriticalSelected === null) maxTotal = null;
    else if (parsed.maxCriticalSelected !== undefined) {
      maxTotal = Math.max(1, Number(parsed.maxCriticalSelected) || 1);
    }

    return sanitizeWizardCopy({
      ...base,
      ...parsed,
      researchStage: stage,
      stepLabels: Array.isArray(parsed.stepLabels) && parsed.stepLabels.length === 5
        ? [
            String(parsed.stepLabels[0] ?? base.stepLabels[0]),
            String(parsed.stepLabels[1] ?? base.stepLabels[1]),
            String(parsed.stepLabels[2] ?? base.stepLabels[2]),
            String(parsed.stepLabels[3] ?? base.stepLabels[3]),
            String(parsed.stepLabels[4] ?? base.stepLabels[4]),
          ]
        : base.stepLabels,
      minCriticalSelected: Math.max(1, Number(parsed.minCriticalSelected ?? base.minCriticalSelected) || 1),
      maxCriticalSelected: maxTotal,
      maxCriticalPerGroup: maxPerGroup,
      minFilledFlows: Math.max(1, Number(parsed.minFilledFlows ?? base.minFilledFlows) || 1),
      pageTitle: String(parsed.pageTitle ?? base.pageTitle),
      reviewSelectedLabel: String(parsed.reviewSelectedLabel ?? base.reviewSelectedLabel),
    });
  } catch {
    return sanitizeWizardCopy({ ...ESCOPO_SETTINGS });
  }
}
