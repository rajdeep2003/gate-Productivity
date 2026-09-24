import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { dailyForDate, dailyForRange, getHourlyBreakdown, monthlyForMonth, questionTotalsList, subjectsList, weeklyForRange, weeklyForStart } from '../services/rollupService.js';
import { dateQuerySchema, dateRangeQuerySchema, monthlyQuerySchema, weeklyQuerySchema } from '../validation/schemas.js';

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  return schema.parse(value);
}

export const daily: RequestHandler = asyncHandler(async (request, response) => {
  const hasDate = Object.hasOwn(request.query, 'date');
  const hasFrom = Object.hasOwn(request.query, 'from');
  const hasTo = Object.hasOwn(request.query, 'to');
  if (hasDate && !hasFrom && !hasTo) {
    const { date } = parse(dateQuerySchema, request.query);
    response.status(200).json(await dailyForDate(date));
    return;
  }
  if (!hasDate && hasFrom && hasTo) {
    const { from, to } = parse(dateRangeQuerySchema, request.query);
    response.status(200).json(await dailyForRange(from, to));
    return;
  }
  throw new AppError('Use either ?date=YYYY-MM-DD or ?from=YYYY-MM-DD&to=YYYY-MM-DD.', 400);
});

export const hourly: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await getHourlyBreakdown(request.params.date));
});

export const weekly: RequestHandler = asyncHandler(async (request, response) => {
  const hasWeekStart = Object.hasOwn(request.query, 'week_start');
  const hasFrom = Object.hasOwn(request.query, 'from');
  const hasTo = Object.hasOwn(request.query, 'to');
  if (hasWeekStart && !hasFrom && !hasTo) {
    const { week_start: weekStart } = parse(weeklyQuerySchema, request.query);
    response.status(200).json(await weeklyForStart(weekStart));
    return;
  }
  if (!hasWeekStart && hasFrom && hasTo) {
    const { from, to } = parse(dateRangeQuerySchema, request.query);
    response.status(200).json(await weeklyForRange(from, to));
    return;
  }
  throw new AppError('Use either ?week_start=YYYY-MM-DD or ?from=YYYY-MM-DD&to=YYYY-MM-DD.', 400);
});

export const monthly: RequestHandler = asyncHandler(async (request, response) => {
  const { year, month } = parse(monthlyQuerySchema, request.query);
  response.status(200).json(await monthlyForMonth(year, month));
});

export const questionsBySub: RequestHandler = asyncHandler(async (_request, response) => {
  response.status(200).json(await questionTotalsList());
});

export const subs: RequestHandler = asyncHandler(async (_request, response) => {
  response.status(200).json(await subjectsList());
});
