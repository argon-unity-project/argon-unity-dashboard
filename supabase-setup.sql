-- ============================================================================
-- ARGON UNITY PROJECT DASHBOARD — Supabase setup
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to run on top of your EXISTING projects/developers tables (it only
-- adds columns) or on a completely fresh project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.developers (
  id          text primary key,
  name        text not null,
  active      boolean not null default true,
  gmail       text default '',
  discord_username text default '',
  contact_details  text default ''
);

-- New auth / role columns (safe if they already exist)
alter table public.developers add column if not exists user_id uuid unique;
alter table public.developers add column if not exists email  text default '';
alter table public.developers add column if not exists role   text not null default 'developer';
alter table public.developers add column if not exists must_change_password boolean not null default false;

do $$ begin
  alter table public.developers
    add constraint developers_role_check check (role in ('admin','leader','developer'));
exception when duplicate_object then null; end $$;

create table if not exists public.projects (
  id           text primary key,
  name         text not null,
  developer_id text references public.developers(id),
  created_at   timestamptz default now(),
  start_date   date,
  end_date     date,
  remarks      text default ''
);

-- New project columns
alter table public.projects add column if not exists status  text not null default 'in_progress';
alter table public.projects add column if not exists lead_id text references public.developers(id);

do $$ begin
  alter table public.projects
    add constraint projects_status_check
    check (status in ('planned','in_progress','testing','completed','on_hold'));
exception when duplicate_object then null; end $$;

-- Daily work log
create table if not exists public.work_logs (
  id          bigint generated always as identity primary key,
  dev_id      text not null references public.developers(id) on delete cascade,
  work_date   date not null,
  project_id  text references public.projects(id) on delete set null,
  other_work  text default '',
  description text not null,
  hours       numeric(4,1) not null check (hours > 0 and hours <= 24),
  status      text not null default 'pending' check (status in ('pending','approved')),
  approved_by text references public.developers(id),
  created_at  timestamptz default now(),
  constraint work_target_check check (project_id is not null or coalesce(other_work,'') <> '')
);

create index if not exists work_logs_date_idx    on public.work_logs (work_date);
create index if not exists work_logs_dev_idx     on public.work_logs (dev_id, work_date);
create index if not exists work_logs_project_idx on public.work_logs (project_id);

-- ---------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS (security definer = they bypass RLS internally,
--    which prevents infinite recursion in the policies below)
-- ---------------------------------------------------------------------------

create or replace function public.my_dev_id()
returns text language sql stable security definer set search_path = public as
$$ select id from developers where user_id = auth.uid() limit 1 $$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as
$$ select coalesce((select role from developers where user_id = auth.uid() limit 1), 'none') $$;

create or replace function public.has_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from developers where role = 'admin' and user_id is not null) $$;

create or replace function public.next_dev_id()
returns text language sql stable security definer set search_path = public as
$$
  select 'DEV' || lpad((coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
  from developers
$$;

-- One-time bootstrap: the very first signed-up user claims the admin seat.
-- Fails for everyone once an admin exists.
create or replace function public.bootstrap_admin(p_name text)
returns text language plpgsql security definer set search_path = public as
$$
declare v_id text; v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from developers where role = 'admin' and user_id is not null) then
    raise exception 'An admin account already exists';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  -- reuse an existing roster row with the same email, else create one
  select id into v_id from developers where user_id is null and lower(email) = lower(v_email) limit 1;
  if v_id is null then
    v_id := next_dev_id();
    insert into developers (id, name, active, role, user_id, email, must_change_password)
    values (v_id, p_name, true, 'admin', auth.uid(), coalesce(v_email,''), false);
  else
    update developers
      set name = p_name, role = 'admin', user_id = auth.uid(), must_change_password = false, active = true
      where id = v_id;
  end if;
  return v_id;
end $$;

grant execute on function public.my_dev_id()  to authenticated;
grant execute on function public.my_role()    to authenticated;
grant execute on function public.has_admin()  to anon, authenticated;
grant execute on function public.next_dev_id() to authenticated;
grant execute on function public.bootstrap_admin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.developers enable row level security;
alter table public.projects   enable row level security;
alter table public.work_logs  enable row level security;

-- Drop old permissive policies if they exist (from the earlier catalog app)
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('developers','projects','work_logs')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- DEVELOPERS ---------------------------------------------------------------
create policy dev_select on public.developers
  for select to authenticated using (true);

create policy dev_insert on public.developers
  for insert to authenticated with check (my_role() = 'admin');

create policy dev_update on public.developers
  for update to authenticated
  using (my_role() = 'admin' or user_id = auth.uid())
  with check (my_role() = 'admin' or user_id = auth.uid());

create policy dev_delete on public.developers
  for delete to authenticated using (my_role() = 'admin');

-- PROJECTS -----------------------------------------------------------------
create policy proj_select on public.projects
  for select to authenticated using (true);

create policy proj_insert on public.projects
  for insert to authenticated with check (my_role() = 'admin');

create policy proj_update on public.projects
  for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'leader' and lead_id = my_dev_id()))
  with check (my_role() = 'admin' or (my_role() = 'leader' and lead_id = my_dev_id()));

create policy proj_delete on public.projects
  for delete to authenticated using (my_role() = 'admin');

-- WORK LOGS ----------------------------------------------------------------
-- Devs see their own; leaders and admins see everyone's.
create policy log_select on public.work_logs
  for select to authenticated
  using (my_role() in ('admin','leader') or dev_id = my_dev_id());

-- Anyone can log work, but only as themselves.
create policy log_insert on public.work_logs
  for insert to authenticated with check (dev_id = my_dev_id());

-- Own pending entries are editable; admins/leaders can update (approve) any.
create policy log_update on public.work_logs
  for update to authenticated
  using (my_role() in ('admin','leader') or (dev_id = my_dev_id() and status = 'pending'))
  with check (my_role() in ('admin','leader') or (dev_id = my_dev_id() and status = 'pending'));

create policy log_delete on public.work_logs
  for delete to authenticated
  using (my_role() = 'admin' or (dev_id = my_dev_id() and status = 'pending'));

-- ---------------------------------------------------------------------------
-- 4. DONE. Next steps (see README.md):
--    1) Authentication → Sign In / Providers → Email: enabled.
--    2) Authentication → Sign In / Providers → "Confirm email": OFF
--       (the admin creates accounts directly with temporary passwords).
--    3) Open index.html → "First-time setup" appears → create your admin.
-- ---------------------------------------------------------------------------
