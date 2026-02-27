create extension if not exists "pgcrypto";

-- Roundtable enums

do $$ begin
  create type public.roundtable_session_status as enum ('lobby', 'live', 'ended', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.roundtable_turn_status as enum ('queued', 'active', 'submitted', 'expired', 'skipped');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.roundtable_member_state as enum ('joined', 'left', 'kicked');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.roundtable_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  tags text[] not null default '{}',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_guest_id text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(created_by_profile_id, created_by_guest_id) = 1)
);

create table if not exists public.roundtable_sessions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.roundtable_topics(id) on delete cascade,
  status public.roundtable_session_status not null default 'lobby',
  max_seats int not null default 5,
  turn_duration_sec int not null default 60,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_guest_id text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_seats = 5),
  check (turn_duration_sec in (60, 90, 120)),
  check (num_nonnulls(created_by_profile_id, created_by_guest_id) = 1)
);

create table if not exists public.roundtable_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.roundtable_sessions(id) on delete cascade,
  seat_no int not null,
  profile_id uuid references public.profiles(id) on delete set null,
  guest_id text,
  display_name text not null,
  state public.roundtable_member_state not null default 'joined',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, seat_no),
  check (seat_no between 1 and 5),
  check (num_nonnulls(profile_id, guest_id) = 1)
);

create table if not exists public.roundtable_raise_hands (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.roundtable_sessions(id) on delete cascade,
  member_id uuid not null references public.roundtable_members(id) on delete cascade,
  status text not null default 'queued',
  queued_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (status in ('queued', 'resolved', 'cancelled'))
);

create table if not exists public.roundtable_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.roundtable_sessions(id) on delete cascade,
  member_id uuid not null references public.roundtable_members(id) on delete cascade,
  status public.roundtable_turn_status not null default 'queued',
  body text,
  starts_at timestamptz,
  ends_at timestamptz,
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  hidden_for_abuse boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roundtable_turn_votes (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.roundtable_turns(id) on delete cascade,
  session_id uuid not null references public.roundtable_sessions(id) on delete cascade,
  voter_member_id uuid not null references public.roundtable_members(id) on delete cascade,
  vote smallint not null,
  created_at timestamptz not null default now(),
  unique (turn_id, voter_member_id),
  check (vote in (-1, 1))
);

create table if not exists public.roundtable_turn_reports (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid not null references public.roundtable_turns(id) on delete cascade,
  session_id uuid not null references public.roundtable_sessions(id) on delete cascade,
  reporter_member_id uuid not null references public.roundtable_members(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (turn_id, reporter_member_id)
);

create table if not exists public.roundtable_scores (
  session_id uuid not null references public.roundtable_sessions(id) on delete cascade,
  member_id uuid not null references public.roundtable_members(id) on delete cascade,
  points int not null default 0,
  approved_turns int not null default 0,
  upvotes_received int not null default 0,
  useful_marks int not null default 0,
  violations int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, member_id)
);

create table if not exists public.roundtable_action_audit (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.roundtable_sessions(id) on delete cascade,
  guest_id text,
  ip_hash text,
  action_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists roundtable_sessions_status_created_idx
  on public.roundtable_sessions (status, created_at desc);

create index if not exists roundtable_sessions_status_updated_idx
  on public.roundtable_sessions (status, updated_at desc);

create index if not exists roundtable_members_session_state_idx
  on public.roundtable_members (session_id, state, joined_at);

create index if not exists roundtable_raise_hands_session_status_queue_idx
  on public.roundtable_raise_hands (session_id, status, queued_at);

create index if not exists roundtable_turns_session_status_created_idx
  on public.roundtable_turns (session_id, status, created_at);

create index if not exists roundtable_turns_session_status_ends_idx
  on public.roundtable_turns (session_id, status, ends_at);

create index if not exists roundtable_turn_votes_session_idx
  on public.roundtable_turn_votes (session_id, created_at);

create index if not exists roundtable_action_audit_action_created_idx
  on public.roundtable_action_audit (action_type, created_at);

create index if not exists roundtable_action_audit_ip_created_idx
  on public.roundtable_action_audit (ip_hash, created_at);

create index if not exists roundtable_action_audit_guest_created_idx
  on public.roundtable_action_audit (guest_id, created_at);

-- Realtime tables publication

do $$
declare
  tbl text;
  tables text[] := array[
    'roundtable_sessions',
    'roundtable_members',
    'roundtable_raise_hands',
    'roundtable_turns',
    'roundtable_scores'
  ];
begin
  foreach tbl in array tables
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
