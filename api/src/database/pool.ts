import { Pool } from 'pg';

async function createMockPool(): Promise<Pool> {
  const { newDb } = await import('pg-mem');
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.createSchema('auth');
  database.public.none(`
    create table public.subs (
      id bigserial primary key, name text not null, code text not null unique
    );
    create table public.sessions (
      id bigserial primary key,
      sub_id bigint not null references public.subs(id),
      study_type text not null check (study_type in ('revision','lecture','q_solve','test','analysis')),
      started_at timestamptz not null, stopped_at timestamptz, duration_seconds bigint,
      topics text, note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      check (stopped_at is null or stopped_at >= started_at),
      check (duration_seconds is null or duration_seconds >= 0)
    );
    create table public.revision (
      id bigserial primary key, session_id bigint not null unique references public.sessions(id) on delete cascade,
      revision_number integer, topics text, notes text
    );
    create table public.lectures (
      id bigserial primary key, session_id bigint not null unique references public.sessions(id) on delete cascade,
      topic text, notes text
    );
    create table public.q_solve (
      id bigserial primary key, session_id bigint not null unique references public.sessions(id) on delete cascade,
      topic text, questions_attempted integer not null default 0, questions_correct integer not null default 0,
      questions_wrong integer not null default 0,
      check (questions_attempted >= 0 and questions_correct >= 0 and questions_wrong >= 0),
      check (questions_correct + questions_wrong <= questions_attempted)
    );
    create table public.tests (
      id bigserial primary key, session_id bigint not null unique references public.sessions(id) on delete cascade,
      test_name text not null, questions_attempted integer not null default 0, questions_correct integer not null default 0,
      score numeric, max_score numeric, notes text,
      check (questions_attempted >= 0 and questions_correct >= 0 and questions_correct <= questions_attempted),
      check (score is null or max_score is null or (score >= 0 and max_score >= 0 and score <= max_score))
    );
    create table public.analysis (
      id bigserial primary key, session_id bigint not null unique references public.sessions(id) on delete cascade,
      analysis_type text, findings text, action_items text, notes text
    );
    create table public.daily (
      id bigserial primary key, date date not null,
      total_seconds bigint not null default 0, revision_seconds bigint not null default 0,
      lecture_seconds bigint not null default 0, q_solve_seconds bigint not null default 0,
      test_seconds bigint not null default 0, analysis_seconds bigint not null default 0, unique (date)
    );
    create table public.weekly (
      id bigserial primary key, week_start date not null,
      total_seconds bigint not null default 0, revision_seconds bigint not null default 0,
      lecture_seconds bigint not null default 0, q_solve_seconds bigint not null default 0,
      test_seconds bigint not null default 0, analysis_seconds bigint not null default 0, unique (week_start)
    );
    create table public.monthly (
      id bigserial primary key,
      year integer not null, month integer not null, total_seconds bigint not null default 0,
      revision_seconds bigint not null default 0, lecture_seconds bigint not null default 0,
      q_solve_seconds bigint not null default 0, test_seconds bigint not null default 0,
      analysis_seconds bigint not null default 0, unique (year, month)
    );
    create table public.questions_by_sub (
      id bigserial primary key,
      sub_id bigint not null references public.subs(id), total_attempted bigint not null default 0,
      total_correct bigint not null default 0, total_wrong bigint not null default 0, unique (sub_id)
    );
  `);

  const { Pool: MemoryPool } = database.adapters.createPg();
  const pool = new MemoryPool() as unknown as Pool;
  await pool.query(
    `insert into public.subs (name, code) values
     ('Engineering Mathematics','MATH'),('Digital Logic','DL'),
     ('Computer Organization and Architecture','COA'),('Operating Systems','OS'),
     ('Database Management Systems','DBMS'),('Computer Networks','CN'),
     ('Theory of Computation','TOC'),('Compiler Design','CD'),
     ('Data Structures','DS'),('Algorithms','ALGO'),
     ('General Aptitude','APT'),('Discrete Mathematics','DM')`,
  );
  const subjects = await pool.query('select id, code from public.subs');
  const subjectId = Object.fromEntries(subjects.rows.map((row) => [row.code, row.id]));
  const revision = (await pool.query(
    `insert into public.sessions (sub_id, study_type, started_at, stopped_at, duration_seconds, topics)
     values ($1, 'revision', '2026-09-23T23:40:00Z', '2026-09-24T00:20:00Z', 2400, 'Limits and continuity') returning id`,
    [subjectId.MATH],
  )).rows[0];
  await pool.query('insert into public.revision (session_id, revision_number) values ($1, 2)', [revision.id]);
  const questions = (await pool.query(
    `insert into public.sessions (sub_id, study_type, started_at, stopped_at, duration_seconds, topics)
     values ($1, 'q_solve', '2026-09-24T09:30:00Z', '2026-09-24T10:30:00Z', 3600, 'Boolean algebra') returning id`,
    [subjectId.DL],
  )).rows[0];
  await pool.query(
    `insert into public.q_solve (session_id, topic, questions_attempted, questions_correct, questions_wrong)
     values ($1, 'Boolean algebra', 20, 15, 5)`,
    [questions.id],
  );
  await pool.query(
    `insert into public.daily (date, total_seconds, revision_seconds)
     values ('2026-09-23', 1200, 1200)`,
  );
  await pool.query(
    `insert into public.daily (date, total_seconds, revision_seconds, q_solve_seconds)
     values ('2026-09-24', 4800, 1200, 3600)`,
  );
  await pool.query(
    `insert into public.weekly (week_start, total_seconds, revision_seconds, q_solve_seconds)
     values ('2026-09-21', 6000, 2400, 3600)`,
  );
  await pool.query(
    `insert into public.monthly (year, month, total_seconds, revision_seconds, q_solve_seconds)
     values (2026, 9, 6000, 2400, 3600)`,
  );
  await pool.query(
    `insert into public.questions_by_sub (sub_id, total_attempted, total_correct, total_wrong)
     values ($1, 20, 15, 5)`, [subjectId.DL],
  );
  return pool;
}

export const pool: Pool = process.env.MOCK_DATA === 'true'
  ? await createMockPool()
  : new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'gate-productivity-api',
    });

pool.on('error', (error) => {
  console.error('Unexpected idle PostgreSQL client error:', error.stack || error);
});
