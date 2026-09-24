import { eq, one, rest, type Row } from '../database/supabase.js';
import type { SessionRow, StudyType } from '../types.js';

const satelliteTables: Record<StudyType, string> = {
  revision: 'revision', lecture: 'lectures', q_solve: 'q_solve', test: 'tests', analysis: 'analysis',
};

export function normalizeRow<T extends Row>(row: T): T {
  const result: Row = { ...row };
  for (const key of ['id', 'sub_id', 'session_id', 'revision_number', 'questions_attempted', 'questions_correct', 'questions_wrong', 'score', 'max_score', 'duration_seconds', 'total_seconds', 'revision_seconds', 'lecture_seconds', 'q_solve_seconds', 'test_seconds', 'analysis_seconds', 'total_attempted', 'total_correct', 'total_wrong']) {
    if (result[key] !== null && result[key] !== undefined) result[key] = Number(result[key]);
  }
  return result as T;
}

export async function findSession(id: string, _forUpdate = false): Promise<SessionRow | null> {
  const rows = await rest<SessionRow[]>('sessions', { query: { select: '*', id: eq(id), ...one } });
  return rows[0] ?? null;
}

export async function findActiveSession(): Promise<SessionRow | null> {
  const rows = await rest<SessionRow[]>('sessions', { query: { select: '*', stopped_at: 'is.null', order: 'started_at.desc,id.desc', ...one } });
  return rows[0] ?? null;
}

export async function listSessions(start: string, endExclusive: string): Promise<SessionRow[]> {
  return rest<SessionRow[]>('sessions', { query: {
    select: '*',
    started_at: `lt.${endExclusive}T00:00:00.000Z`,
    or: `(stopped_at.is.null,stopped_at.gt.${start}T00:00:00.000Z)`,
    order: 'started_at.desc,id.desc',
  } });
}

export async function subjectExists(subId: string | number): Promise<boolean> {
  const rows = await rest<Row[]>('subs', { query: { select: 'id', id: eq(subId), ...one } });
  return rows.length > 0;
}

export async function insertSession(input: {
  subId: number; studyType: StudyType; startedAt: string; topics?: string | null; note?: string | null;
}): Promise<SessionRow> {
  const rows = await rest<SessionRow[]>('sessions', {
    method: 'POST', prefer: 'return=representation',
    body: { sub_id: input.subId, study_type: input.studyType, started_at: input.startedAt, topics: input.topics ?? null, note: input.note ?? null },
  });
  return rows[0];
}

export async function updateSession(current: SessionRow, values: Partial<{
  sub_id: number; study_type: StudyType; started_at: string; stopped_at: string | null;
  duration_seconds: number | null; topics: string | null; note: string | null;
}>): Promise<SessionRow> {
  const rows = await rest<SessionRow[]>('sessions', {
    method: 'PATCH', query: { id: eq(current.id as string | number) }, prefer: 'return=representation',
    body: { ...values, updated_at: new Date().toISOString() },
  });
  return rows[0];
}

export async function deleteSession(session: SessionRow): Promise<void> {
  await rest('sessions', { method: 'DELETE', query: { id: eq(session.id as string | number) } });
}

export async function getSatellite(sessionId: string | number, studyType: StudyType): Promise<Row | null> {
  const rows = await rest<Row[]>(satelliteTables[studyType], { query: { select: '*', session_id: eq(sessionId), ...one } });
  return rows[0] ? normalizeRow(rows[0]) : null;
}

export async function addSatelliteDefaults(sessionId: string | number, studyType: StudyType): Promise<void> {
  const table = satelliteTables[studyType];
  await rest(table, {
    method: 'POST', prefer: 'return=minimal',
    body: { session_id: sessionId, ...(studyType === 'test' ? { test_name: 'Untitled test' } : {}) },
  });
}

export async function removeSatellite(sessionId: string | number, studyType: StudyType): Promise<void> {
  await rest(satelliteTables[studyType], { method: 'DELETE', query: { session_id: eq(sessionId) } });
}

const patchableSatelliteFields: Record<StudyType, Record<string, string>> = {
  revision: { revision_number: 'revision_number', topics: 'topics', notes: 'notes' },
  lecture: { topic: 'topic', notes: 'notes' },
  q_solve: { topic: 'topic', questions_attempted: 'questions_attempted', questions_correct: 'questions_correct', questions_wrong: 'questions_wrong' },
  test: { test_name: 'test_name', questions_attempted: 'questions_attempted', questions_correct: 'questions_correct', score: 'score', max_score: 'max_score', notes: 'notes' },
  analysis: { analysis_type: 'analysis_type', findings: 'findings', action_items: 'action_items', notes: 'notes' },
};

export async function updateSatellite(sessionId: string | number, studyType: StudyType, values: Record<string, unknown>): Promise<Row> {
  const allowed = patchableSatelliteFields[studyType];
  if (Object.keys(values).some((key) => !allowed[key])) throw new Error('Unsupported satellite field.');
  const rows = await rest<Row[]>(satelliteTables[studyType], {
    method: 'PATCH', query: { session_id: eq(sessionId) }, prefer: 'return=representation', body: values,
  });
  return rows[0] ? normalizeRow(rows[0]) : {};
}

export async function getSessionDetail(id: string): Promise<Row | null> {
  const session = await findSession(id);
  if (!session) return null;
  const satellite = await getSatellite(session.id, session.study_type);
  return { ...normalizeRow(session as unknown as Row), satellite };
}

export async function subjects(): Promise<Row[]> {
  return (await rest<Row[]>('subs', { query: { select: 'id,name,code', order: 'id.asc' } })).map(normalizeRow);
}

export async function questionTotalsBySubject(): Promise<Row[]> {
  return (await rest<Row[]>('subs', { query: { select: 'id,name,code,questions_by_sub(total_attempted,total_correct,total_wrong)', order: 'id.asc' } }))
    .map((row) => {
      const embeddedTotals = row.questions_by_sub;
      const totals = Array.isArray(embeddedTotals)
        ? embeddedTotals[0] as Row | undefined
        : embeddedTotals as Row | null | undefined;
      const normalized = normalizeRow(row);
      delete normalized.questions_by_sub;
      return normalizeRow({ ...normalized, sub_id: normalized.id, sub_name: normalized.name,
        total_attempted: totals?.total_attempted ?? 0, total_correct: totals?.total_correct ?? 0, total_wrong: totals?.total_wrong ?? 0 });
    });
}
