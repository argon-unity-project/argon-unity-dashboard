-- ---------------------------------------------------------------------------
-- Projects: per-project holiday count
--
-- Working days = Mon–Sat between start and end date, minus this number.
-- Defaults to 0. Run once in the Supabase SQL editor. Safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists holidays integer not null default 0;

alter table public.projects
  drop constraint if exists projects_holidays_nonneg;
alter table public.projects
  add constraint projects_holidays_nonneg check (holidays >= 0);

-- refresh PostgREST so the API sees the new column right away
notify pgrst, 'reload schema';
