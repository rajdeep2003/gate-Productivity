import { eq, rest, type Row } from '../database/supabase.js';
import type { HourlyBreakdownRow } from '../types.js';

const totalsColumns = 'total_seconds,revision_seconds,lecture_seconds,q_solve_seconds,test_seconds,analysis_seconds';

export async function readDaily(date: string) {
  const rows = await rest<Row[]>('daily', { query: { select: `date,${totalsColumns}`, date: eq(date) } });
  return rows[0] ?? { date, total_seconds: 0, revision_seconds: 0, lecture_seconds: 0, q_solve_seconds: 0, test_seconds: 0, analysis_seconds: 0 };
}

export async function readDailyRange(from: string, to: string) {
  return rest<Row[]>('daily', { query: { select: `date,${totalsColumns}`, and: `(date.gte.${from},date.lte.${to})`, order: 'date.asc' } });
}

export async function readWeekly(weekStart: string) {
  const rows = await rest<Row[]>('weekly', { query: { select: `week_start,${totalsColumns}`, week_start: eq(weekStart) } });
  return rows[0] ?? { week_start: weekStart, total_seconds: 0, revision_seconds: 0, lecture_seconds: 0, q_solve_seconds: 0, test_seconds: 0, analysis_seconds: 0 };
}

export async function readWeeklyRange(from: string, to: string) {
  return rest<Row[]>('weekly', { query: { select: `week_start,${totalsColumns}`, and: `(week_start.gte.${from},week_start.lte.${to})`, order: 'week_start.asc' } });
}

export async function readMonthly(year: number, month: number) {
  const rows = await rest<Row[]>('monthly', { query: { select: `year,month,${totalsColumns}`, year: eq(year), month: eq(month) } });
  return rows[0] ?? { year, month, total_seconds: 0, revision_seconds: 0, lecture_seconds: 0, q_solve_seconds: 0, test_seconds: 0, analysis_seconds: 0 };
}

export async function overlappingSessionsForDay(start: string, end: string) {
  const rows = await rest<Array<Row & { sub_id: string | number; study_type: HourlyBreakdownRow['study_type']; started_at: string; stopped_at: string | null; subs: { name: string } | null }>>('sessions', {
    query: {
      select: 'started_at,stopped_at,sub_id,study_type,subs(name)',
      started_at: `lt.${end}`,
      or: `(stopped_at.is.null,stopped_at.gt.${start})`,
      order: 'started_at.asc,id.asc',
    },
  });
  return rows.map((row) => ({
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    sub_id: row.sub_id,
    study_type: row.study_type,
    sub_name: row.subs?.name ?? '',
  }));
}
