import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  activeSession,
  createSession,
  editSession,
  patchQuestionSolve,
  patchSatellite,
  removeSession,
  sessionDetail,
  sessionsForDate,
  sessionsForRange,
  stopSession,
} from '../services/sessionService.js';
import {
  analysisPatchSchema,
  createSessionSchema,
  dateQuerySchema,
  dateRangeQuerySchema,
  idParamSchema,
  lecturePatchSchema,
  patchSessionSchema,
  qsolvePatchSchema,
  revisionPatchSchema,
  stopSessionSchema,
  testPatchSchema,
} from '../validation/schemas.js';

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  return schema.parse(value);
}

function sessionId(request: Parameters<RequestHandler>[0]): string {
  return parse(idParamSchema, request.params).id;
}

export const create: RequestHandler = asyncHandler(async (request, response) => {
  const input = parse(createSessionSchema, request.body);
  response.status(201).json(await createSession(input));
});

export const getActive: RequestHandler = asyncHandler(async (_request, response) => {
  response.status(200).json(await activeSession());
});

export const getOne: RequestHandler = asyncHandler(async (request, response) => {
  const result = await sessionDetail(sessionId(request));
  if (!result) throw new AppError('Session not found.', 404);
  response.status(200).json(result);
});

export const list: RequestHandler = asyncHandler(async (request, response) => {
  const query = request.query;
  const hasDate = Object.hasOwn(query, 'date');
  const hasFrom = Object.hasOwn(query, 'from');
  const hasTo = Object.hasOwn(query, 'to');
  if (hasDate && !hasFrom && !hasTo) {
    const { date } = parse(dateQuerySchema, query);
    response.status(200).json(await sessionsForDate(date));
    return;
  }
  if (!hasDate && hasFrom && hasTo) {
    const { from, to } = parse(dateRangeQuerySchema, query);
    response.status(200).json(await sessionsForRange(from, to));
    return;
  }
  throw new AppError('Use either ?date=YYYY-MM-DD or ?from=YYYY-MM-DD&to=YYYY-MM-DD.', 400);
});

export const stop: RequestHandler = asyncHandler(async (request, response) => {
  const id = sessionId(request);
  const body = parse(stopSessionSchema, request.body ?? {});
  response.status(200).json(await stopSession(id, body.stopped_at ?? new Date().toISOString()));
});

export const edit: RequestHandler = asyncHandler(async (request, response) => {
  const id = sessionId(request);
  const patch = parse(patchSessionSchema, request.body);
  response.status(200).json(await editSession(id, patch));
});

export const remove: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await removeSession(sessionId(request)));
});

export const patchRevision: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await patchSatellite(sessionId(request), 'revision', parse(revisionPatchSchema, request.body)));
});

export const patchLecture: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await patchSatellite(sessionId(request), 'lecture', parse(lecturePatchSchema, request.body)));
});

export const patchQsolve: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await patchQuestionSolve(sessionId(request), parse(qsolvePatchSchema, request.body)));
});

export const patchTest: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await patchSatellite(sessionId(request), 'test', parse(testPatchSchema, request.body)));
});

export const patchAnalysis: RequestHandler = asyncHandler(async (request, response) => {
  response.status(200).json(await patchSatellite(sessionId(request), 'analysis', parse(analysisPatchSchema, request.body)));
});
