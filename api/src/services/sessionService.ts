import { AppError } from '../errors/AppError.js';
import { applyQuestionDelta, applySessionAggregateDelta, questionCountsFromRow, subtractQuestionCounts } from './aggregation.js';
import { withMutation } from './transaction.js';
import type { QuestionCounts, SessionRow, StudyType } from '../types.js';
import {
  addSatelliteDefaults,
  deleteSession,
  findActiveSession,
  findSession,
  getSatellite,
  getSessionDetail,
  insertSession,
  listSessions,
  normalizeRow,
  removeSatellite,
  subjectExists,
  updateSatellite,
  updateSession,
} from '../models/sessionModel.js';
import { addUtcDays, assertDateRange, mondayOfIsoWeek, parseDateOnly } from '../utils/dates.js';

export interface CreateSessionInput {
  sub_id: number;
  study_type: StudyType;
  started_at?: string;
  topics?: string | null;
  note?: string | null;
}

export type SessionPatch = Partial<Pick<CreateSessionInput, 'sub_id' | 'study_type' | 'started_at' | 'topics' | 'note'>> & {
  stopped_at?: string | null;
};

function notFound() {
  return new AppError('Session not found.', 404);
}

function timestamp(value: Date | string): number {
  return new Date(value).getTime();
}

function calculateDurationSeconds(startedAt: Date | string, stoppedAt: Date | string | null): number | null {
  if (stoppedAt === null) return null;
  return Math.floor((timestamp(stoppedAt) - timestamp(startedAt)) / 1000);
}

function validateSessionTimes(startedAt: Date | string, stoppedAt: Date | string | null) {
  if (!Number.isFinite(timestamp(startedAt))) throw new AppError('started_at must be a valid timestamp.', 400);
  if (stoppedAt !== null && (!Number.isFinite(timestamp(stoppedAt)) || timestamp(stoppedAt) < timestamp(startedAt))) {
    throw new AppError('stopped_at must be a valid timestamp on or after started_at.', 400);
  }
}

function countDifference(after: QuestionCounts, before: QuestionCounts): QuestionCounts {
  return {
    questions_attempted: after.questions_attempted - before.questions_attempted,
    questions_correct: after.questions_correct - before.questions_correct,
    questions_wrong: after.questions_wrong - before.questions_wrong,
  };
}

export async function createSession(input: CreateSessionInput) {
  const startedAt = input.started_at ?? new Date().toISOString();
  validateSessionTimes(startedAt, null);
  return withMutation(async () => {
    if (!(await subjectExists(input.sub_id))) throw new AppError('sub_id does not match a subject.', 400);
    const session = await insertSession({
      subId: input.sub_id,
      studyType: input.study_type,
      startedAt,
      topics: input.topics,
      note: input.note,
    });
    await addSatelliteDefaults(session.id, session.study_type);
    return getSessionDetail(String(session.id));
  });
}

export async function stopSession(id: string, stoppedAt = new Date().toISOString()) {
  return withMutation(async () => {
    const oldSession = await findSession(id, true);
    if (!oldSession) throw notFound();
    if (oldSession.stopped_at !== null) throw new AppError('Session is already stopped.', 400);
    validateSessionTimes(oldSession.started_at, stoppedAt);
    const newSession = await updateSession(oldSession, {
      stopped_at: stoppedAt,
      duration_seconds: calculateDurationSeconds(oldSession.started_at, stoppedAt),
    });
    await applySessionAggregateDelta(oldSession, newSession);
    return getSessionDetail(id);
  });
}

export async function editSession(id: string, patch: SessionPatch) {
  return withMutation(async () => {
    const oldSession = await findSession(id, true);
    if (!oldSession) throw notFound();

    const nextType = patch.study_type ?? oldSession.study_type;
    const nextSubId = patch.sub_id ?? Number(oldSession.sub_id);
    const nextStartedAt = patch.started_at ?? oldSession.started_at;
    const nextStoppedAt = Object.hasOwn(patch, 'stopped_at') ? patch.stopped_at ?? null : oldSession.stopped_at;
    validateSessionTimes(nextStartedAt, nextStoppedAt);
    if (patch.sub_id !== undefined && !(await subjectExists(nextSubId))) {
      throw new AppError('sub_id does not match a subject.', 400);
    }

    const values: Parameters<typeof updateSession>[1] = {};
    if (patch.sub_id !== undefined) values.sub_id = nextSubId;
    if (patch.study_type !== undefined) values.study_type = nextType;
    if (patch.started_at !== undefined) values.started_at = patch.started_at;
    if (Object.hasOwn(patch, 'stopped_at')) values.stopped_at = patch.stopped_at ?? null;
    if (patch.topics !== undefined) values.topics = patch.topics;
    if (patch.note !== undefined) values.note = patch.note;
    if (patch.started_at !== undefined || Object.hasOwn(patch, 'stopped_at')) {
      values.duration_seconds = calculateDurationSeconds(nextStartedAt, nextStoppedAt);
    }

    const changingType = nextType !== oldSession.study_type;
    const oldSatellite = oldSession.study_type === 'q_solve' ? await getSatellite(oldSession.id, 'q_solve') : null;
    if (oldSession.study_type === 'q_solve' && oldSatellite && (changingType || nextSubId !== Number(oldSession.sub_id))) {
      const oldCounts = questionCountsFromRow(oldSatellite as Partial<QuestionCounts>);
      await applyQuestionDelta(oldSession.sub_id, subtractQuestionCounts(oldCounts));
    }

    const updated = await updateSession(oldSession, values);
    if (changingType) {
      await removeSatellite(oldSession.id, oldSession.study_type);
      await addSatelliteDefaults(oldSession.id, nextType);
    } else if (oldSession.study_type === 'q_solve' && oldSatellite && nextSubId !== Number(oldSession.sub_id)) {
      await applyQuestionDelta(nextSubId, questionCountsFromRow(oldSatellite as Partial<QuestionCounts>));
    }

    await applySessionAggregateDelta(oldSession, updated);
    return getSessionDetail(id);
  });
}

export async function removeSession(id: string) {
  return withMutation(async () => {
    const session = await findSession(id, true);
    if (!session) throw notFound();
    if (session.study_type === 'q_solve') {
      const satellite = await getSatellite(session.id, 'q_solve');
      if (satellite) await applyQuestionDelta(session.sub_id, subtractQuestionCounts(questionCountsFromRow(satellite as Partial<QuestionCounts>)));
    }
    await applySessionAggregateDelta(session, null);
    await deleteSession(session);
    return { deleted: true, id: Number(session.id) };
  });
}

export async function patchSatellite(id: string, studyType: Exclude<StudyType, 'q_solve'>, values: Record<string, unknown>) {
  return withMutation(async () => {
    const session = await findSession(id, true);
    if (!session) throw notFound();
    if (session.study_type !== studyType) throw new AppError(`This session is not a ${studyType} session.`, 400);
    if (studyType === 'test') {
      const current = await getSatellite(session.id, 'test');
      if (!current) throw new AppError('Test details are missing for this session.');
      const attempted = Number(values.questions_attempted ?? current.questions_attempted ?? 0);
      const correct = Number(values.questions_correct ?? current.questions_correct ?? 0);
      const scoreValue = Object.hasOwn(values, 'score') ? values.score : current.score;
      const maxValue = Object.hasOwn(values, 'max_score') ? values.max_score : current.max_score;
      if (correct > attempted) throw new AppError('questions_correct cannot exceed questions_attempted.', 400);
      if (scoreValue !== null && scoreValue !== undefined && maxValue !== null && maxValue !== undefined && Number(scoreValue) > Number(maxValue)) {
        throw new AppError('score cannot exceed max_score.', 400);
      }
    }
    await updateSatellite(session.id, studyType, values);
    return getSessionDetail(id);
  });
}

export async function patchQuestionSolve(id: string, values: Record<string, unknown>) {
  return withMutation(async () => {
    const session = await findSession(id, true);
    if (!session) throw notFound();
    if (session.study_type !== 'q_solve') throw new AppError('This session is not a q_solve session.', 400);
    const oldRow = await getSatellite(session.id, 'q_solve');
    if (!oldRow) throw new AppError('Question-solving details are missing for this session.');
    const oldCounts = questionCountsFromRow(oldRow as Partial<QuestionCounts>);
    const nextCounts = { ...oldCounts, ...values } as QuestionCounts;
    if (nextCounts.questions_correct + nextCounts.questions_wrong > nextCounts.questions_attempted) {
      throw new AppError('Correct and wrong counts cannot exceed questions_attempted.', 400);
    }
    if (nextCounts.questions_attempted < 0 || nextCounts.questions_correct < 0 || nextCounts.questions_wrong < 0) {
      throw new AppError('Question counts cannot be negative.', 400);
    }
    await updateSatellite(session.id, 'q_solve', values);
    await applyQuestionDelta(session.sub_id, countDifference(nextCounts, oldCounts));
    return getSessionDetail(id);
  });
}

export async function activeSession() {
  const row = await findActiveSession();
  if (!row) return null;
  const detail = await getSessionDetail(String(row.id));
  return detail;
}

export async function sessionDetail(id: string) {
  return getSessionDetail(id);
}

export async function sessionsForDate(dateValue: string) {
  const date = parseDateOnly(dateValue);
  return (await listSessions(date, addUtcDays(date, 1))).map((row) => normalizeRow(row as unknown as Record<string, unknown>));
}

export async function sessionsForRange(fromValue: string, toValue: string) {
  const from = parseDateOnly(fromValue, 'from');
  const to = parseDateOnly(toValue, 'to');
  assertDateRange(from, to);
  return (await listSessions(from, addUtcDays(to, 1))).map((row) => normalizeRow(row as unknown as Record<string, unknown>));
}

export async function weeklySessionsForRange(fromValue: string, toValue: string) {
  const from = parseDateOnly(fromValue, 'from');
  const to = parseDateOnly(toValue, 'to');
  assertDateRange(from, to);
  return { from_week_start: mondayOfIsoWeek(from), to_week_start: mondayOfIsoWeek(to) };
}
