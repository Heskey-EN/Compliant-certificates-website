-- ============================================================
-- Compliant Property Certificates — database schema
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: drops/recreates policies, keeps your data.
-- ============================================================

-- ---------- Tables ----------

-- One profile row per user. Mirrors auth.users and adds role + display name.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text,
  role        text not null default 'member' check (role in ('admin','member')),
  created_at  timestamptz not null default now()
);

-- Jobs added from the dashboard.
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references auth.users(id) on delete cascade,
  postcode    text not null,
  address     text,
  service     text not null check (service in ('EPC','EICR','Gas Safety','PAT')),
  job_date    date not null,
  job_time    time,
  notes       text,
  status      text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at  timestamptz not null default now()
);

create index if not exists jobs_created_by_idx on public.jobs (created_by);
create index if not exists jobs_date_idx on public.jobs (job_date);

-- ---------- Online bookings migration (safe to re-run) ----------
-- Customer bookings paid online have no logged-in user, so created_by is
-- nullable and we record the customer + payment details on the job.
alter table public.jobs alter column created_by drop not null;
alter table public.jobs add column if not exists source text not null default 'staff';
alter table public.jobs add column if not exists customer_name text;
alter table public.jobs add column if not exists customer_email text;
alter table public.jobs add column if not exists customer_phone text;
alter table public.jobs add column if not exists bedrooms text;
alter table public.jobs add column if not exists payment_status text;
alter table public.jobs add column if not exists amount_paid integer;       -- pence
alter table public.jobs add column if not exists stripe_session_id text;
-- Prevent the same paid checkout creating duplicate jobs.
create unique index if not exists jobs_stripe_session_idx
  on public.jobs (stripe_session_id) where stripe_session_id is not null;

-- ---------- Helper: is the current user an admin? ----------
-- SECURITY DEFINER so it bypasses RLS and can't cause policy recursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- Auto-create a profile when a new auth user is added ----------
-- Reads username / full_name / role from the user's metadata (set by the
-- admin "create member" function). Falls back to sensible defaults.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row-Level Security ----------
alter table public.profiles enable row level security;
alter table public.jobs     enable row level security;

-- Profiles: a user sees their own profile; admins see everyone's.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using ( id = auth.uid() or public.is_admin() );

-- Jobs: admins see ALL jobs; members see ONLY their own.
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select using ( created_by = auth.uid() or public.is_admin() );

-- Jobs: any logged-in user can add a job, stamped as themselves.
drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
  for insert with check ( created_by = auth.uid() );

-- Jobs: a user can edit/delete their own; admins can edit/delete any.
drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
  for update using ( created_by = auth.uid() or public.is_admin() )
  with check ( created_by = auth.uid() or public.is_admin() );

drop policy if exists jobs_delete on public.jobs;
create policy jobs_delete on public.jobs
  for delete using ( created_by = auth.uid() or public.is_admin() );
