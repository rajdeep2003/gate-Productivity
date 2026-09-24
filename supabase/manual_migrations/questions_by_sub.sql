-- The rollup is maintained transactionally by the Node API.
create table if not exists public.questions_by_sub (
    id bigint generated always as identity primary key,
    sub_id bigint not null references public.subs(id),
    total_attempted bigint not null default 0 check (total_attempted >= 0),
    total_correct bigint not null default 0 check (total_correct >= 0),
    total_wrong bigint not null default 0 check (total_wrong >= 0),
    unique (sub_id)
);

insert into public.questions_by_sub (sub_id, total_attempted, total_correct, total_wrong)
select s.sub_id,
       sum(q.questions_attempted),
       sum(q.questions_correct),
       sum(q.questions_wrong)
from public.q_solve q
join public.sessions s on s.id = q.session_id
where s.study_type = 'q_solve'
group by s.sub_id
on conflict (sub_id) do update set
    total_attempted = excluded.total_attempted,
    total_correct = excluded.total_correct,
    total_wrong = excluded.total_wrong;

-- Direct Data API clients cannot mutate source sessions/satellites or rollups;
-- writes go through the Node API, which updates all affected rows in one transaction.
revoke insert, update, delete, truncate on table
    public.sessions,
    public.revision,
    public.lectures,
    public.q_solve,
    public.tests,
    public.analysis,
    public.daily,
    public.weekly,
    public.monthly,
    public.questions_by_sub
from anon, authenticated;
