import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.MOCK_DATA = 'true';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost/mock';

const [{ default: app }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/database/pool.js'),
]);

let server: ReturnType<typeof app.listen>;
let baseUrl = '';

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

test('mock data and HTTP API smoke checks', async () => {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.payload, { status: 'ok' });

  const subjects = await request('/subs');
  assert.equal(subjects.status, 200);
  assert.equal(subjects.payload.length, 12);
  const math = subjects.payload.find((subject: { code: string }) => subject.code === 'MATH');
  const digitalLogic = subjects.payload.find((subject: { code: string }) => subject.code === 'DL');
  assert.ok(math && digitalLogic);

  const seededDay = await request('/daily?date=2026-09-24');
  assert.equal(seededDay.payload.total_seconds, 4800);
  assert.equal(seededDay.payload.revision_seconds, 1200);
  assert.equal(seededDay.payload.q_solve_seconds, 3600);
  const dayHours = await request('/daily/2026-09-24/hourly');
  assert.deepEqual(dayHours.payload.filter((row: { hour: number }) => row.hour === 9 || row.hour === 10).map((row: { hour: number; seconds: number }) => [row.hour, row.seconds]), [[9, 1800], [10, 1800]]);
  assert.equal((await request('/daily?from=2026-09-23&to=2026-09-24')).payload.length, 2);
  assert.equal((await request('/weekly?week_start=2026-09-21')).payload.total_seconds, 6000);
  assert.equal((await request('/weekly?from=2026-09-23&to=2026-09-24')).payload[0].week_start.slice(0, 10), '2026-09-21');
  assert.equal((await request('/monthly?year=2026&month=9')).payload.total_seconds, 6000);
  assert.equal((await request('/questions/by-sub')).payload.find((row: { sub_id: number }) => row.sub_id === digitalLogic.id).total_attempted, 20);
  assert.equal((await request('/sessions?date=2026-09-24')).payload.length, 2);
  assert.equal((await request('/sessions?from=2026-09-23&to=2026-09-24')).payload.length, 2);
  assert.equal((await request('/sessions/active')).payload, null);

  const invalid = await request('/sessions', 'POST', { sub_id: 1, study_type: 'bogus' });
  assert.equal(invalid.status, 400);
  const missing = await request('/sessions/999999', 'GET');
  assert.equal(missing.status, 404);

  const started = await request('/sessions', 'POST', {
    sub_id: math.id,
    study_type: 'revision',
    started_at: '2026-09-25T23:30:00.000Z',
    topics: 'Midnight split demo',
  });
  assert.equal(started.status, 201);
  assert.equal(started.payload.satellite.revision_number, null);
  const sessionId = started.payload.id;
  assert.equal((await request('/sessions/active')).payload.id, sessionId);
  const stopped = await request(`/sessions/${sessionId}/stop`, 'PATCH', { stopped_at: '2026-09-26T00:30:00.000Z' });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.payload.duration_seconds, 3600);
  assert.equal((await request('/sessions/active')).payload, null);
  assert.equal((await request('/daily?date=2026-09-25')).payload.revision_seconds, 1800);
  assert.equal((await request('/daily?date=2026-09-26')).payload.revision_seconds, 1800);
  assert.deepEqual((await request('/daily/2026-09-25/hourly')).payload.map((row: { hour: number; seconds: number }) => [row.hour, row.seconds]), [[23, 1800]]);
  assert.deepEqual((await request('/daily/2026-09-26/hourly')).payload.map((row: { hour: number; seconds: number }) => [row.hour, row.seconds]), [[0, 1800]]);
  assert.equal((await request('/sessions?from=2026-09-25&to=2026-09-26')).payload.length, 1);

  const revisionPatch = await request(`/sessions/${sessionId}/revision`, 'PATCH', { revision_number: 3, notes: 'Reviewed' });
  assert.equal(revisionPatch.payload.satellite.revision_number, 3);
  const converted = await request(`/sessions/${sessionId}`, 'PATCH', { study_type: 'lecture' });
  assert.equal(converted.payload.satellite.topic, null);
  assert.equal(converted.payload.satellite.revision_number, undefined);
  const lecturePatch = await request(`/sessions/${sessionId}/lecture`, 'PATCH', { topic: 'Limits', notes: 'Lecture notes' });
  assert.equal(lecturePatch.payload.satellite.topic, 'Limits');
  assert.equal((await request('/daily?date=2026-09-25')).payload.lecture_seconds, 1800);
  assert.equal((await request('/daily?date=2026-09-25')).payload.revision_seconds, 0);

  const qsolveStarted = await request('/sessions', 'POST', {
    sub_id: math.id,
    study_type: 'q_solve',
    started_at: '2026-09-26T11:00:00.000Z',
  });
  const qsolveId = qsolveStarted.payload.id;
  await request(`/sessions/${qsolveId}/stop`, 'PATCH', { stopped_at: '2026-09-26T12:00:00.000Z' });
  const qsolvePatch = await request(`/sessions/${qsolveId}/qsolve`, 'PATCH', {
    topic: 'Matrices', questions_attempted: 10, questions_correct: 8, questions_wrong: 2,
  });
  assert.equal(qsolvePatch.payload.satellite.questions_attempted, 10);
  assert.equal((await request('/questions/by-sub')).payload.find((row: { sub_id: number }) => row.sub_id === math.id).total_attempted, 10);

  const moved = await request(`/sessions/${qsolveId}`, 'PATCH', { sub_id: digitalLogic.id });
  assert.equal(moved.payload.sub_id, digitalLogic.id);
  const afterMove = await request('/questions/by-sub');
  assert.equal(afterMove.payload.find((row: { sub_id: number }) => row.sub_id === math.id).total_attempted, 0);
  assert.equal(afterMove.payload.find((row: { sub_id: number }) => row.sub_id === digitalLogic.id).total_attempted, 30);

  const testSession = await request(`/sessions/${qsolveId}`, 'PATCH', { study_type: 'test' });
  assert.equal(testSession.payload.satellite.test_name, 'Untitled test');
  assert.equal((await request('/questions/by-sub')).payload.find((row: { sub_id: number }) => row.sub_id === digitalLogic.id).total_attempted, 20);
  const testPatch = await request(`/sessions/${qsolveId}/test`, 'PATCH', {
    test_name: 'Mock GATE test', questions_attempted: 12, questions_correct: 9, score: 9, max_score: 12,
  });
  assert.equal(testPatch.payload.satellite.test_name, 'Mock GATE test');
  assert.equal((await request(`/sessions/${qsolveId}`)).payload.satellite.score, 9);
  assert.equal((await request(`/sessions/${qsolveId}/test`, 'PATCH', { questions_attempted: 2 })).status, 400);
  assert.equal((await request(`/sessions/${qsolveId}`, 'DELETE')).payload.deleted, true);
  assert.equal((await request('/daily?date=2026-09-26')).payload.total_seconds, 1800);
  assert.equal((await request('/daily?date=2026-09-26')).payload.test_seconds, 0);

  const analysis = await request('/sessions', 'POST', {
    sub_id: math.id, study_type: 'analysis',
  });
  const analysisPatch = await request(`/sessions/${analysis.payload.id}/analysis`, 'PATCH', { analysis_type: 'weekly', findings: 'More revision needed' });
  assert.equal(analysisPatch.payload.satellite.analysis_type, 'weekly');
  const analysisStopped = await request(`/sessions/${analysis.payload.id}/stop`, 'PATCH');
  assert.equal(analysisStopped.status, 200);
  assert.notEqual(analysisStopped.payload.stopped_at, null);

  const sessionPatch = await request(`/sessions/${sessionId}`, 'PATCH', { note: 'Updated note', stopped_at: null });
  assert.equal(sessionPatch.payload.note, 'Updated note');
  assert.equal(sessionPatch.payload.duration_seconds, null);
  assert.equal((await request('/daily?date=2026-09-25')).payload.total_seconds, 0);
  assert.equal((await request('/daily?date=not-a-date')).status, 400);
  const deleted = await request(`/sessions/${analysis.payload.id}`, 'DELETE');
  assert.equal(deleted.status, 200);
  assert.equal(deleted.payload.deleted, true);
});
