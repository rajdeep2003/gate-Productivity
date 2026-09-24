import { rest, type Row } from '../database/supabase.js';
import { addUtcDays, mondayOfIsoWeek } from '../utils/dates.js';
import type { DailyContribution, QuestionCounts, SessionRow, StudyType } from '../types.js';

const aggregateColumns = ['revision_seconds', 'lecture_seconds', 'q_solve_seconds', 'test_seconds', 'analysis_seconds'] as const;
type AggregateColumn = (typeof aggregateColumns)[number];
type BucketDelta = { total: number; byType: Record<AggregateColumn, number> };

function columnForStudyType(studyType: StudyType): AggregateColumn { return `${studyType}_seconds` as AggregateColumn; }
function emptyDelta(): BucketDelta { return { total: 0, byType: { revision_seconds: 0, lecture_seconds: 0, q_solve_seconds: 0, test_seconds: 0, analysis_seconds: 0 } }; }

export function splitDurationByDay(startedAt: Date | string, stoppedAt: Date | string): DailyContribution[] {
  const startMs = new Date(startedAt).getTime();
  const stopMs = new Date(stoppedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) return [];
  const totalSeconds = Math.floor((stopMs - startMs) / 1000);
  if (totalSeconds <= 0) return [];
  const overlaps: Array<{ date: string; seconds: number; fraction: number }> = [];
  let date = new Date(startMs).toISOString().slice(0, 10);
  while (new Date(`${date}T00:00:00.000Z`).getTime() < stopMs) {
    const dayStart = new Date(`${date}T00:00:00.000Z`).getTime();
    const overlap = Math.max(0, Math.min(stopMs, dayStart + 86_400_000) - Math.max(startMs, dayStart));
    if (overlap > 0) {
      const exact = overlap / 1000;
      overlaps.push({ date, seconds: Math.floor(exact), fraction: exact % 1 });
    }
    date = addUtcDays(date, 1);
  }
  let remainder = totalSeconds - overlaps.reduce((sum, item) => sum + item.seconds, 0);
  for (const item of [...overlaps].sort((a, b) => b.fraction - a.fraction || a.date.localeCompare(b.date)).slice(0, remainder)) item.seconds += 1;
  return overlaps.filter((item) => item.seconds > 0).map(({ date: day, seconds }) => ({ date: day, seconds }));
}

function addContribution(target: Map<string, BucketDelta>, key: string, type: StudyType, seconds: number) {
  const delta = target.get(key) ?? emptyDelta();
  delta.total += seconds;
  delta.byType[columnForStudyType(type)] += seconds;
  target.set(key, delta);
}

function addSession(session: SessionRow | null, sign: 1 | -1, daily: Map<string, BucketDelta>, weekly: Map<string, BucketDelta>, monthly: Map<string, BucketDelta>) {
  if (!session || session.duration_seconds === null || session.stopped_at === null) return;
  for (const contribution of splitDurationByDay(session.started_at, session.stopped_at)) {
    const seconds = contribution.seconds * sign;
    addContribution(daily, contribution.date, session.study_type, seconds);
    addContribution(weekly, mondayOfIsoWeek(contribution.date), session.study_type, seconds);
    addContribution(monthly, contribution.date.slice(0, 7), session.study_type, seconds);
  }
}

async function adjustBucket(table: 'daily' | 'weekly' | 'monthly', period: string, delta: BucketDelta) {
  const deltas = { total_seconds: delta.total, ...delta.byType };
  if (Object.values(deltas).every((value) => value === 0)) return;
  const query: Record<string, string> = table === 'daily' ? { date: `eq.${period}` }
    : table === 'weekly' ? { week_start: `eq.${period}` }
      : { year: `eq.${period.slice(0, 4)}`, month: `eq.${Number(period.slice(5, 7))}` };
  const current = await rest<Row[]>(table, { query: { select: '*', ...query } });
  const next = Object.fromEntries(Object.entries(deltas).map(([key, value]) => [key, Math.max(0, Number(current[0]?.[key] ?? 0) + value)]));
  const periodFields = table === 'daily' ? { date: period }
    : table === 'weekly' ? { week_start: period }
      : { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
  await rest(table, { method: 'POST', query: { on_conflict: Object.keys(periodFields).join(',') }, prefer: 'resolution=merge-duplicates,return=minimal', body: { ...periodFields, ...next } });
}

export async function applySessionAggregateDelta(oldSession: SessionRow | null, newSession: SessionRow | null) {
  const daily = new Map<string, BucketDelta>();
  const weekly = new Map<string, BucketDelta>();
  const monthly = new Map<string, BucketDelta>();
  addSession(oldSession, -1, daily, weekly, monthly);
  addSession(newSession, 1, daily, weekly, monthly);
  for (const [period, delta] of daily) await adjustBucket('daily', period, delta);
  for (const [period, delta] of weekly) await adjustBucket('weekly', period, delta);
  for (const [period, delta] of monthly) await adjustBucket('monthly', period, delta);
}

export async function applyQuestionDelta(subId: string | number, delta: QuestionCounts) {
  if (delta.questions_attempted === 0 && delta.questions_correct === 0 && delta.questions_wrong === 0) return;
  const current = await rest<Row[]>('questions_by_sub', { query: { select: 'total_attempted,total_correct,total_wrong', sub_id: `eq.${subId}` } });
  const body = {
    sub_id: subId,
    total_attempted: Math.max(0, Number(current[0]?.total_attempted ?? 0) + delta.questions_attempted),
    total_correct: Math.max(0, Number(current[0]?.total_correct ?? 0) + delta.questions_correct),
    total_wrong: Math.max(0, Number(current[0]?.total_wrong ?? 0) + delta.questions_wrong),
  };
  await rest('questions_by_sub', { method: 'POST', query: { on_conflict: 'sub_id' }, prefer: 'resolution=merge-duplicates,return=minimal', body });
}

export function questionCountsFromRow(row: Partial<QuestionCounts> | null | undefined): QuestionCounts {
  return { questions_attempted: Number(row?.questions_attempted ?? 0), questions_correct: Number(row?.questions_correct ?? 0), questions_wrong: Number(row?.questions_wrong ?? 0) };
}

export function subtractQuestionCounts(counts: QuestionCounts): QuestionCounts {
  return { questions_attempted: -counts.questions_attempted, questions_correct: -counts.questions_correct, questions_wrong: -counts.questions_wrong };
}
