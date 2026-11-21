export interface AnswerExample {
  tier: string;
  answer: string;
  score: number;
}

export interface Prompt {
  id: string;
  text: string;
  hint: string;
  answers: AnswerExample[];
}

export interface AnswerDay {
  date: string;
  displayDate: string;
  dayNumber: number;
  verifiedAt: string;
  resetsAt: string;
  source: string;
  prompts: Prompt[];
}

const modules = import.meta.glob('./answers/*.json', { eager: true });

export const answerDays = Object.values(modules)
  .map((module) => (module as { default: AnswerDay }).default)
  .sort((a, b) => b.date.localeCompare(a.date));

export const latestDay = answerDays[0];
