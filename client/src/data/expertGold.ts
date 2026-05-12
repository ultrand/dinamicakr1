/**
 * Baseline editorial (“ouro especialista”): conjunto mínimo de cards alinhado a
 * escopo de projeto bem definido (brief → pessoas → modelo → direcionamento → logística).
 * Matching com tarefas da versão é por verbo + texto principal (case-insensitive).
 */
export type ExpertGoldCard = {
  verb: string;
  textoPrincipal: string;
  etapa: string;
  rationale: string;
};

export const EXPERT_GOLD_CARDS: ExpertGoldCard[] = [
  {
    verb: "Assimilar",
    textoPrincipal: "expectativas de futuro do projeto",
    etapa: "Condições do Trabalho",
    rationale:
      "Sem alinhamento de futuro desejado, o resto do escopo vira lista de tarefas sem norte mensurável.",
  },
  {
    verb: "Assimilar",
    textoPrincipal: "conflitos e sensibilidades políticas",
    etapa: "Condições do Trabalho",
    rationale:
      "Conflitos implícitos derrubam entrevistas, aprovações e prioridades; tratar cedo evita retrabalho caro.",
  },
  {
    verb: "Conhecer",
    textoPrincipal: "visão estratégica e negócio",
    etapa: "Condições do Trabalho",
    rationale:
      "A pesquisa precisa servir decisão de negócio; a visão estratégica ancora critérios de relevância e recorte.",
  },
  {
    verb: "Determinar",
    textoPrincipal: "problema de projeto",
    etapa: "Condições do Trabalho",
    rationale:
      "Problema mal formulado gera objetivos frágeis; é o elo entre contexto e pergunta de pesquisa.",
  },
  {
    verb: "Assimilar",
    textoPrincipal: "perfis de pessoas envolvidas",
    etapa: "Entendimento Preparatório",
    rationale:
      "Stakeholders e usuários definem acesso, linguagem, riscos éticos e validade do recorte amostral.",
  },
  {
    verb: "Mapear",
    textoPrincipal: "restrições do briefing",
    etapa: "Entendimento Preparatório",
    rationale:
      "Restrições explícitas (tempo, orçamento, tabu, dados) são contratos tácitos do escopo mínimo viável.",
  },
  {
    verb: "Mapear",
    textoPrincipal: "pontos funcionais de impacto",
    etapa: "Entendimento Preparatório",
    rationale:
      "Pontos de impacto no serviço traduzem o modelo operacional em hipóteses testáveis e priorização.",
  },
  {
    verb: "Definir",
    textoPrincipal: "foco da pesquisa",
    etapa: "Definições Preliminares",
    rationale:
      "Foco delimita o recorte analítico: sem ele, o escopo explode em perguntas demais para uma única entrega.",
  },
  {
    verb: "Escrever",
    textoPrincipal: "questão de pesquisa",
    etapa: "Definições Preliminares",
    rationale:
      "A questão de pesquisa é o teste de coerência entre problema, evidência e método — o “contrato” do estudo.",
  },
  {
    verb: "Definir",
    textoPrincipal: "abordagem metodológica",
    etapa: "Definições Preliminares",
    rationale:
      "Método explícito liga recursos, riscos e cronograma; sem isso o escopo não é executável nem defendível.",
  },
  {
    verb: "Definir",
    textoPrincipal: "cronograma e etapas",
    etapa: "Definições Preliminares",
    rationale:
      "Cronograma materializa o escopo no tempo; sem etapas acordadas, promessas e dependências ficam invisíveis.",
  },
];
