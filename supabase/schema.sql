-- StartupManch backend schema (Supabase)

create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('founder', 'investor', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.startup_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.pitch_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.pitch_type as enum ('elevator', 'demo');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.vote_type as enum ('in', 'out');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.user_role not null default 'founder',
  display_name text,
  city text,
  created_at timestamptz not null default now()
);

create table if not exists public.startups (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  category text,
  city text,
  one_liner text,
  website text,
  founder_photo_url text,
  founder_story text,
  monthly_revenue text,
  social_links jsonb,
  is_d2c boolean not null default false,
  status public.startup_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- Single analytics event stream for client instrumentation
create table if not exists public.analytics (
  id bigint generated always as identity primary key,
  pitch_id uuid references public.pitches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Single analytics event stream for client instrumentation
create table if not exists public.analytics (
  id bigint generated always as identity primary key,
  pitch_id uuid references public.pitches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pitches (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  type public.pitch_type not null default 'elevator',
  ask text,
  equity text,
  valuation text,
  video_path text,
  poster_path text,
  duration_sec integer,
  status public.pitch_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.pitch_votes (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  vote public.vote_type not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (pitch_id, voter_id)
);

create table if not exists public.pitch_comments (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  parent_id uuid references public.pitch_comments(id),
  created_at timestamptz not null default now()
);

create table if not exists public.investor_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- Investor Connect
create table if not exists public.investor_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text,
  firm text,
  cheque_min int,
  cheque_max int,
  linkedin_url text,
  official_email text,
  pan text,
  cin text,
  gst text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  investor_id uuid not null references public.investor_profiles(id) on delete cascade,
  status public.request_status not null default 'pending',
  note text,
  cheque_hint int,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id)
);

-- General contact requests from viewers to founders
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid references public.pitches(id) on delete cascade,
  name text,
  email text,
  message text,
  offer_amount numeric,
  created_at timestamptz not null default now()
);

alter table public.contact_requests enable row level security;

create policy "Contact requests insertable" on public.contact_requests
for insert
to authenticated, anon
with check (true);

create policy "Contact requests viewable by admin" on public.contact_requests
for select
to authenticated
using (public.is_admin());

create or replace view public.pitch_stats as
select
  p.id as pitch_id,
  count(v.id) filter (where v.vote = 'in')::int as in_count,
  count(v.id) filter (where v.vote = 'out')::int as out_count,
  count(c.id)::int as comment_count
from public.pitches p
left join public.pitch_votes v on v.pitch_id = p.id
left join public.pitch_comments c on c.pitch_id = p.id
group by p.id;

create or replace view public.pitch_stats_7d as
select
  p.id as pitch_id,
  count(v.id) filter (where v.vote = 'in')::int as in_count,
  count(v.id) filter (where v.vote = 'out')::int as out_count,
  count(v.id)::int as total_votes
from public.pitches p
left join public.pitch_votes v
  on v.pitch_id = p.id
  and v.created_at >= now() - interval '7 days'
where p.created_at >= now() - interval '7 days'
group by p.id;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when new.email = 'saharashsharma3@gmail.com' then 'admin'
      else 'founder'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.fetch_pitch_feed(
  mode text default 'feed',
  tab text default 'trending',
  category_filter text default null,
  max_items int default 20,
  offset_items int default 0,
  min_votes int default 10
)
returns table (
  pitch_id uuid,
  startup_id uuid,
  startup_name text,
  category text,
  city text,
  one_liner text,
  video_path text,
  poster_path text,
  created_at timestamptz,
  in_count int,
  out_count int,
  comment_count int,
  score numeric
)
language sql
stable
as $$
  with stats_all as (
    select
      pitch_id,
      in_count,
      out_count,
      comment_count,
      (coalesce(in_count, 0) * 2
        - coalesce(out_count, 0)
        + coalesce(comment_count, 0) * 1.5) as score
    from public.pitch_stats
  ),
  stats_week as (
    select
      pitch_id,
      in_count,
      out_count,
      total_votes,
      (coalesce(in_count, 0) - coalesce(out_count, 0)) as score
    from public.pitch_stats_7d
  )
  select
    p.id as pitch_id,
    s.id as startup_id,
    s.name as startup_name,
    s.category,
    s.city,
    s.one_liner,
    p.video_path,
    p.poster_path,
    p.created_at,
    coalesce(
      case when mode = 'week' then sw.in_count else st.in_count end,
      0
    ) as in_count,
    coalesce(
      case when mode = 'week' then sw.out_count else st.out_count end,
      0
    ) as out_count,
    coalesce(st.comment_count, 0) as comment_count,
    coalesce(
      case when mode = 'week' then sw.score else st.score end,
      0
    ) as score
  from public.pitches p
  join public.startups s on s.id = p.startup_id
  left join stats_all st on st.pitch_id = p.id
  left join stats_week sw on sw.pitch_id = p.id
  where p.status = 'approved'
    and s.status = 'approved'
    and p.type = 'elevator'
    and (
      (mode = 'week'
        and p.created_at >= now() - interval '7 days'
        and coalesce(sw.total_votes, 0) >= min_votes
      )
      or (mode <> 'week' and (
        tab = 'trending'
        or tab = 'fresh'
        or (tab = 'food' and (s.category ilike '%food%' or s.category ilike '%beverage%'))
        or (tab = 'fashion' and (s.category ilike '%fashion%' or s.category ilike '%apparel%'))
        or (
          tab = 'category'
          and coalesce(nullif(trim(category_filter), ''), '') <> ''
          and s.category ilike '%' || trim(category_filter) || '%'
        )
      ))
    )
  order by
    case when mode = 'week' then coalesce(sw.score, 0) end desc,
    case when mode = 'week' then p.created_at end desc,
    case when mode <> 'week' and tab = 'fresh' then p.created_at end desc,
    case when mode <> 'week' and tab <> 'fresh' then coalesce(st.score, 0) end desc,
    p.created_at desc
  limit max_items offset offset_items;
$$;

alter table public.profiles enable row level security;
alter table public.startups enable row level security;
alter table public.pitches enable row level security;
alter table public.pitch_votes enable row level security;
alter table public.pitch_comments enable row level security;
alter table public.investor_requests enable row level security;

create policy "Profiles are viewable by authenticated"
on public.profiles
for select
using (auth.role() = 'authenticated');

create policy "Profiles are insertable by owner"
on public.profiles
for insert
with check (auth.uid() = id or public.is_admin());

create policy "Profiles are updatable by owner or admin"
on public.profiles
for update
using (auth.uid() = id or public.is_admin());

create policy "Startups are viewable if approved or owner"
on public.startups
for select
using (
  status = 'approved'
  or founder_id = auth.uid()
  or public.is_admin()
);

create policy "Startups are insertable by founders"
on public.startups
for insert
with check (
  (public.current_user_role() in ('founder', 'admin'))
  and (founder_id = auth.uid() or public.is_admin())
);

create policy "Startups are updatable by owner or admin"
on public.startups
for update
using (founder_id = auth.uid() or public.is_admin());

create policy "Pitches are viewable if approved or owner"
on public.pitches
for select
using (
  status = 'approved'
  or public.is_admin()
  or exists (
    select 1 from public.startups s
    where s.id = startup_id
      and s.founder_id = auth.uid()
  )
);

create policy "Pitches are insertable by founder owners"
on public.pitches
for insert
with check (
  public.is_admin()
  or exists (
    select 1 from public.startups s
    where s.id = startup_id
      and s.founder_id = auth.uid()
  )
);

create policy "Pitches are updatable by owner or admin"
on public.pitches
for update
using (
  public.is_admin()
  or exists (
    select 1 from public.startups s
    where s.id = startup_id
      and s.founder_id = auth.uid()
  )
);

create policy "Votes are insertable by verified roles"
on public.pitch_votes
for insert
with check (
  public.current_user_role() in ('founder', 'investor', 'admin')
  and exists (
    select 1 from public.pitches p
    where p.id = pitch_id
      and p.status = 'approved'
  )
);

create policy "Votes are updatable by owner"
on public.pitch_votes
for update
using (voter_id = auth.uid() or public.is_admin());

create policy "Comments are viewable on approved pitches"
on public.pitch_comments
for select
using (
  exists (
    select 1 from public.pitches p
    where p.id = pitch_id
      and p.status = 'approved'
  )
  or public.is_admin()
);

create policy "Comments are insertable by verified roles"
on public.pitch_comments
for insert
with check (
  public.current_user_role() in ('founder', 'investor', 'admin')
  and exists (
    select 1 from public.pitches p
    where p.id = pitch_id
      and p.status = 'approved'
  )
);

create policy "Investor requests insertable"
on public.investor_requests
for insert
with check (user_id = auth.uid());

create policy "Investor requests viewable by owner or admin"
on public.investor_requests
for select
using (user_id = auth.uid() or public.is_admin());

create policy "Investor requests updatable by admin"
on public.investor_requests
for update
using (public.is_admin());

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_role() to authenticated;
