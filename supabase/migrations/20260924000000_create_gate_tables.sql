-- ============================================================
-- GATE 2027 MANAGEMENT APP
-- No RLS / No security policies
-- ============================================================


-- ============================================================
-- 1. SUBJECTS
-- ============================================================

create table public.subs (
    id bigint generated always as identity primary key,
    name text not null,
    code text not null unique
);


-- ============================================================
-- 2. SESSIONS
-- SOURCE OF TRUTH
-- ============================================================

create table public.sessions (
    id bigint generated always as identity primary key,

    sub_id bigint not null references public.subs(id),

    study_type text not null
        check (study_type in (
            'revision',
            'lecture',
            'q_solve',
            'test',
            'analysis'
        )),

    started_at timestamptz not null,
    stopped_at timestamptz,

    duration_seconds bigint,

    topics text,
    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- A stopped session must have stopped_at.
    -- An active session can have stopped_at = NULL.
    constraint valid_session_times
        check (
            stopped_at is null
            or stopped_at >= started_at
        ),

    -- Duration cannot be negative.
    constraint valid_duration
        check (
            duration_seconds is null
            or duration_seconds >= 0
        )
);


-- ============================================================
-- 3. REVISION
-- Revision-specific information
-- ============================================================

create table public.revision (
    id bigint generated always as identity primary key,

    session_id bigint not null unique
        references public.sessions(id) on delete cascade,

    revision_number integer,
    topics text,
    notes text
);


-- ============================================================
-- 4. LECTURES
-- Lecture-specific information
-- ============================================================

create table public.lectures (
    id bigint generated always as identity primary key,

    session_id bigint not null unique
        references public.sessions(id) on delete cascade,

    topic text,
    notes text
);


-- ============================================================
-- 5. Q SOLVE
-- Question-solving specific information
-- ============================================================

create table public.q_solve (
    id bigint generated always as identity primary key,

    session_id bigint not null unique
        references public.sessions(id) on delete cascade,

    topic text,

    questions_attempted integer not null default 0,
    questions_correct integer not null default 0,
    questions_wrong integer not null default 0,

    constraint valid_question_counts
        check (
            questions_attempted >= 0
            and questions_correct >= 0
            and questions_wrong >= 0
        ),

    constraint valid_question_sum
        check (
            questions_correct + questions_wrong <= questions_attempted
        )
);


-- ============================================================
-- 6. TESTS
-- Test-specific information
-- ============================================================

create table public.tests (
    id bigint generated always as identity primary key,

    session_id bigint not null unique
        references public.sessions(id) on delete cascade,

    test_name text not null,

    questions_attempted integer not null default 0,
    questions_correct integer not null default 0,

    score numeric,
    max_score numeric,

    notes text,

    constraint valid_test_questions
        check (
            questions_attempted >= 0
            and questions_correct >= 0
            and questions_correct <= questions_attempted
        ),

    constraint valid_test_score
        check (
            score is null
            or max_score is null
            or (
                score >= 0
                and max_score >= 0
                and score <= max_score
            )
        )
);


-- ============================================================
-- 7. ANALYSIS
-- Analysis-specific information
-- ============================================================

create table public.analysis (
    id bigint generated always as identity primary key,

    session_id bigint not null unique
        references public.sessions(id) on delete cascade,

    analysis_type text,
    findings text,
    action_items text,
    notes text
);


-- ============================================================
-- 8. DAILY
-- Aggregated from sessions
-- ============================================================

create table public.daily (
    id bigint generated always as identity primary key,


    date date not null,

    total_seconds bigint not null default 0,

    revision_seconds bigint not null default 0,
    lecture_seconds bigint not null default 0,
    q_solve_seconds bigint not null default 0,
    test_seconds bigint not null default 0,
    analysis_seconds bigint not null default 0,

    unique (date)
);


-- ============================================================
-- 9. WEEKLY
-- Aggregated from sessions
-- ============================================================

create table public.weekly (
    id bigint generated always as identity primary key,


    week_start date not null,

    total_seconds bigint not null default 0,

    revision_seconds bigint not null default 0,
    lecture_seconds bigint not null default 0,
    q_solve_seconds bigint not null default 0,
    test_seconds bigint not null default 0,
    analysis_seconds bigint not null default 0,

    unique (week_start)
);


-- ============================================================
-- 10. MONTHLY
-- Aggregated from sessions
-- ============================================================

create table public.monthly (
    id bigint generated always as identity primary key,


    year integer not null,
    month integer not null,

    total_seconds bigint not null default 0,

    revision_seconds bigint not null default 0,
    lecture_seconds bigint not null default 0,
    q_solve_seconds bigint not null default 0,
    test_seconds bigint not null default 0,
    analysis_seconds bigint not null default 0,

    constraint valid_month
        check (month between 1 and 12),

    unique (year, month)
);


-- ============================================================
-- INDEXES
-- ============================================================

create index sessions_sub_id_idx
    on public.sessions(sub_id);

create index sessions_started_at_idx
    on public.sessions(started_at);

create index daily_date_idx
    on public.daily(date);

create index weekly_week_start_idx
    on public.weekly(week_start);

create index monthly_year_month_idx
    on public.monthly(year, month);
-- Seed the GATE subject catalog. Reapplying this section will not duplicate subjects.
insert into public.subs (name, code) values
    ('Engineering Mathematics', 'MATH'),
    ('Digital Logic', 'DL'),
    ('Computer Organization and Architecture', 'COA'),
    ('Operating Systems', 'OS'),
    ('Database Management Systems', 'DBMS'),
    ('Computer Networks', 'CN'),
    ('Theory of Computation', 'TOC'),
    ('Compiler Design', 'CD'),
    ('Data Structures', 'DS'),
    ('Algorithms', 'ALGO'),
    ('General Aptitude', 'APT'),
    ('Discrete Mathematics', 'DM')
on conflict (code) do nothing;
