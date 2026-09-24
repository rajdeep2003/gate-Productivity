import { AppError } from '../errors/AppError.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string, label = 'date'): string {
  if (!DATE_RE.test(value)) throw new AppError(`${label} must use YYYY-MM-DD format.`, 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(`${label} must be a valid calendar date.`, 400);
  }
  return value;
}

export function addUtcDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOfIsoWeek(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function assertDateRange(from: string, to: string): void {
  if (from > to) throw new AppError('from must be on or before to.', 400);
}
