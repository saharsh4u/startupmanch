alter table public.startups
  add column if not exists founded_on date,
  add column if not exists country_code text,
  add column if not exists is_for_sale boolean not null default false,
  add column if not exists asking_price numeric,
  add column if not exists currency_code text not null default 'INR',
  add column if not exists self_reported_all_time_revenue numeric,
  add column if not exists self_reported_mrr numeric,
  add column if not exists self_reported_active_subscriptions int;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'startups_currency_code_check'
  ) then
    alter table public.startups
      add constraint startups_currency_code_check
      check (upper(currency_code) in ('INR', 'USD'));
  end if;
end $$;

create table if not exists public.startup_watchers (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  anon_id text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(profile_id, anon_id) = 1)
);

create unique index if not exists startup_watchers_startup_profile_uidx
  on public.startup_watchers (startup_id, profile_id)
  where profile_id is not null;

create unique index if not exists startup_watchers_startup_anon_uidx
  on public.startup_watchers (startup_id, anon_id)
  where anon_id is not null;

create index if not exists startup_watchers_startup_idx
  on public.startup_watchers (startup_id);

alter table public.contact_requests
  add column if not exists startup_id uuid references public.startups(id) on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contact_requests_startup_or_pitch_check'
  ) then
    alter table public.contact_requests
      add constraint contact_requests_startup_or_pitch_check
      check (pitch_id is not null or startup_id is not null);
  end if;
end $$;

create index if not exists contact_requests_startup_id_idx
  on public.contact_requests (startup_id);
