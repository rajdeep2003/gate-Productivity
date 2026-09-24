export const studyTypes = ['revision', 'lecture', 'q_solve', 'test', 'analysis'] as const;
export type StudyType = (typeof studyTypes)[number];

export interface SessionRow {
  id: string | number;
  sub_id: string | number;
  study_type: StudyType;
  started_at: Date | string;
  stopped_at: Date | string | null;
  duration_seconds: string | number | null;
  topics: string | null;
  note: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface QuestionCounts {
  questions_attempted: number;
  questions_correct: number;
  questions_wrong: number;
}

export interface DailyContribution {
  date: string;
  seconds: number;
}

export interface HourlyBreakdownRow {
  hour: number;
  sub_id: number;
  sub_name: string;
  study_type: StudyType;
  seconds: number;
}
