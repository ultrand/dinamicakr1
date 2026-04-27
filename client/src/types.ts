export type Task = {
  id: string;
  verb: string;
  textoPrincipal: string;
  atividade: string;
  etapa: string;
  inactive?: boolean;
  hasResponses?: boolean;
};

export type QuestionType =
  | "critical_select"
  | "critical_rank"
  | "hardest_critical"
  | "text_long"
  | "flow_builder_per_critical";

export type Question = {
  id: string;
  type: QuestionType | string;
  title: string;
  helpText: string;
  required: boolean;
  sortOrder: number;
};

export type StudyVersion = {
  id: string;
  number: number;
  isDraft: boolean;
  label?: string;
  settingsJson?: string;
  tasks: Task[];
  questions: Question[];
};
