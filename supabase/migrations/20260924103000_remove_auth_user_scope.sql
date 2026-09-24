-- This app is intentionally single-user and does not use Supabase Auth.
-- The affected tables were empty when this migration was prepared.
alter table public.sessions drop column if exists user_id cascade;
alter table public.daily drop column if exists user_id cascade;
alter table public.weekly drop column if exists user_id cascade;
alter table public.monthly drop column if exists user_id cascade;

alter table public.daily drop constraint if exists daily_date_key;
alter table public.daily add constraint daily_date_key unique (date);
alter table public.weekly drop constraint if exists weekly_week_start_key;
alter table public.weekly add constraint weekly_week_start_key unique (week_start);
alter table public.monthly drop constraint if exists monthly_year_month_key;
alter table public.monthly add constraint monthly_year_month_key unique (year, month);

create index if not exists sessions_started_at_idx on public.sessions (started_at);
create index if not exists daily_date_idx on public.daily (date);
create index if not exists weekly_week_start_idx on public.weekly (week_start);
create index if not exists monthly_year_month_idx on public.monthly (year, month);

create table if not exists public.questions_by_sub (
    id bigint generated always as identity primary key,
    sub_id bigint not null unique references public.subs(id),
    total_attempted bigint not null default 0 check (total_attempted >= 0),
    total_correct bigint not null default 0 check (total_correct >= 0),
    total_wrong bigint not null default 0 check (total_wrong >= 0)
);

alter table public.questions_by_sub drop column if exists user_id cascade;
create unique index if not exists questions_by_sub_sub_id_key on public.questions_by_sub (sub_id);

insert into public.questions_by_sub (sub_id, total_attempted, total_correct, total_wrong)
select s.sub_id, sum(q.questions_attempted), sum(q.questions_correct), sum(q.questions_wrong)
from public.q_solve q
join public.sessions s on s.id = q.session_id
where s.study_type = 'q_solve'
group by s.sub_id
on conflict (sub_id) do update set
    total_attempted = excluded.total_attempted,
    total_correct = excluded.total_correct,
    total_wrong = excluded.total_wrong;
