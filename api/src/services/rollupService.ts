import { AppError } from '../errors/AppError.js';
import type { HourlyBreakdownRow } from '../types.js';
import { addUtcDays, mondayOfIsoWeek, parseDateOnly } from '../utils/dates.js';
import { normalizeRow, questionTotalsBySubject, subjects } from '../models/sessionModel.js';
import { overlappingSessionsForDay, readDaily, readDailyRange, readMonthly, readWeekly, readWeeklyRange } from '../models/rollupModel.js';

function toApiRows<T extends Array<Record<string, unknown>>>(rows: T): T {
  return rows.map((row) => normalizeRow(row)) as T;
}

export async function dailyForDate(dateValue: string) {
  const date = parseDateOnly(dateValue);
  return normalizeRow(await readDaily(date));
}

export async function dailyForRange(fromValue: string, toValue: string) {
  const from = parseDateOnly(fromValue, 'from');
  const to = parseDateOnly(toValue, 'to');
  if (from > to) throw new AppError('from must be on or before to.', 400);
  const rows = new Map((await readDailyRange(from, to)).map((row) => [String(row.date).slice(0, 10), normalizeRow(row)]));
  const result = [];
  for (let date = from; date <= to; date = addUtcDays(date, 1)) {
    result.push(rows.get(date) ?? {
      date,
      total_seconds: 0,
      revision_seconds: 0,
      lecture_seconds: 0,
      q_solve_seconds: 0,
      test_seconds: 0,
      analysis_seconds: 0,
    });
  }
  return result;
}

export async function weeklyForStart(weekStartValue: string) {
  const weekStart = parseDateOnly(weekStartValue, 'week_start');
  if (mondayOfIsoWeek(weekStart) !== weekStart) throw new AppError('week_start must be a Monday (ISO week convention).', 400);
  return normalizeRow(await readWeekly(weekStart));
}

export async function weeklyForRange(fromValue: string, toValue: string) {
  const from = parseDateOnly(fromValue, 'from');
  const to = parseDateOnly(toValue, 'to');
  if (from > to) throw new AppError('from must be on or before to.', 400);
  return toApiRows(await readWeeklyRange(mondayOfIsoWeek(from), mondayOfIsoWeek(to)));
}

export async function monthlyForMonth(year: number, month: number) {
  return normalizeRow(await readMonthly(year, month));
}

function allocateWholeSeconds(overlaps: Array<{ hour: number; milliseconds: number }>): Array<{ hour: number; seconds: number }> {
  const target = Math.floor(overlaps.reduce((sum, item) => sum + item.milliseconds, 0) / 1000);
  const rounded = overlaps.map((item) => ({
    hour: item.hour,
    seconds: Math.floor(item.milliseconds / 1000),
    fraction: (item.milliseconds / 1000) % 1,
  }));
  const remainder = target - rounded.reduce((sum, item) => sum + item.seconds, 0);
  const order = [...rounded].sort((a, b) => b.fraction - a.fraction || a.hour - b.hour);
  for (let index = 0; index < remainder; index += 1) order[index].seconds += 1;
  return rounded.filter((item) => item.seconds > 0).map(({ hour, seconds }) => ({ hour, seconds }));
}

export async function getHourlyBreakdown(dateValue: string): Promise<HourlyBreakdownRow[]> {
  const date = parseDateOnly(dateValue);
  const start = `${date}T00:00:00.000Z`;
  const end = `${addUtcDays(date, 1)}T00:00:00.000Z`;
  const rows = await overlappingSessionsForDay(start, end);
  const now = Date.now();
  const result = new Map<string, HourlyBreakdownRow>();

  for (const row of rows) {
    const sessionStart = new Date(row.started_at).getTime();
    const sessionEnd = row.stopped_at === null ? now : new Date(row.stopped_at).getTime();
    const overlaps: Array<{ hour: number; milliseconds: number }> = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const hourStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`).getTime();
      const hourEnd = hourStart + 3_600_000;
      const milliseconds = Math.max(0, Math.min(sessionEnd, hourEnd) - Math.max(sessionStart, hourStart));
      if (milliseconds > 0) overlaps.push({ hour, milliseconds });
    }
    for (const share of allocateWholeSeconds(overlaps)) {
      const key = `${share.hour}:${row.sub_id}:${row.study_type}`;
      const existing = result.get(key);
      if (existing) existing.seconds += share.seconds;
      else result.set(key, {
        hour: share.hour,
        sub_id: Number(row.sub_id),
        sub_name: row.sub_name,
        study_type: row.study_type,
        seconds: share.seconds,
      });
    }
  }

  return [...result.values()].sort((a, b) => a.hour - b.hour || a.sub_id - b.sub_id || a.study_type.localeCompare(b.study_type));
}

export async function subjectsList() {
  return subjects();
}

export async function questionTotalsList() {
  return questionTotalsBySubject();
}
