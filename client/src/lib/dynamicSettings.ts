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
  step1Sub: "Escolha todas as tarefas que considera difíceis de realizar no método.",
  step2Title: "Ordene por prioridade",
  step2Sub: "Arraste ou use ↑↓ para ordenar de forma geral, do mais crítico ao menos crítico.",
  step3Title: "Perguntas sobre o método",
  step3Sub: "Responda antes de montar os fluxos.",
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
  step1Title: "Tarefas fundamentais e relevantes",
  step1Sub:
    "Quais tarefas são as mais relevantes e fundamentais para a condução do projeto e para o alinhamento com o cliente? Selecione até 10 tarefas no total.",
  step2Title: "Ordene por relevância individual",
  step2Sub:
    "Ordene da mais fundamental e relevante para a menos. Isto não é ordem de execução nem cadeia de dependências — isso você fará no passo Fluxos, mais adiante.",
  step3Title: "Dificuldades",
  step3Sub: "Entre as tarefas que você selecionou, indique a mais difícil e explique por quê.",
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

export function templateForStage(stage: ResearchStage): DynamicSettings {
  return stage === "metodo" ? { ...METODO_SETTINGS } : { ...ESCOPO_SETTINGS };
}

export function parseDynamicSettings(raw: string | undefined): DynamicSettings {
  if (!raw) return { ...ESCOPO_SETTINGS };
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

    return {
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
    };
  } catch {
    return { ...ESCOPO_SETTINGS };
  }
}
