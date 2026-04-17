export type Task = {
  id: string;
  verb: string;
  textoPrincipal: string;
  atividade: string;
  etapa: string;
  inactive?: boolean;
  hasResponses?: boolean;
};

export type Question = {
  id: string;
  type: string;
  title: string;
  helpText: string;
  required: boolean;
  sortOrder: number;
};

export type StudyVersion = {
  id: string;
  number: number;
  isDraft: boolean;
  tasks: Task[];
  questions: Question[];
};
