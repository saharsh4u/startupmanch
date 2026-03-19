do $$ begin
  create type public.roundtable_session_visibility as enum ('public', 'private');
exception
  when duplicate_object then null;
end $$;

alter table public.roundtable_sessions
  add column if not exists visibility public.roundtable_session_visibility not null default 'public';

alter table public.roundtable_members
  add column if not exists last_seen_at timestamptz not null default now();

update public.roundtable_sessions
set visibility = 'public'
where visibility is distinct from 'public';

create index if not exists roundtable_sessions_visibility_status_idx
  on public.roundtable_sessions (visibility, status, created_at desc);

create index if not exists roundtable_members_session_last_seen_idx
  on public.roundtable_members (session_id, last_seen_at desc);
