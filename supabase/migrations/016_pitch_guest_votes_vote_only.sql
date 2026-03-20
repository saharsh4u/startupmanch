create table if not exists public.pitch_guest_votes (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  guest_key text not null,
  vote public.vote_type not null,
  created_at timestamptz not null default now(),
  unique (pitch_id, guest_key)
);

create index if not exists pitch_guest_votes_pitch_created_idx
  on public.pitch_guest_votes (pitch_id, created_at desc);

alter table public.pitch_guest_votes enable row level security;

create or replace view public.pitch_stats as
with all_votes as (
  select pitch_id, vote
  from public.pitch_votes
  union all
  select pitch_id, vote
  from public.pitch_guest_votes
)
select
  p.id as pitch_id,
  count(v.pitch_id) filter (where v.vote = 'in')::int as in_count,
  count(v.pitch_id) filter (where v.vote = 'out')::int as out_count,
  0::int as comment_count
from public.pitches p
left join all_votes v on v.pitch_id = p.id
group by p.id;

create or replace view public.pitch_stats_7d as
with recent_votes as (
  select pitch_id, vote, created_at
  from public.pitch_votes
  union all
  select pitch_id, vote, created_at
  from public.pitch_guest_votes
)
select
  p.id as pitch_id,
  count(v.pitch_id) filter (where v.vote = 'in')::int as in_count,
  count(v.pitch_id) filter (where v.vote = 'out')::int as out_count,
  count(v.pitch_id)::int as total_votes
from public.pitches p
left join recent_votes v
  on v.pitch_id = p.id
  and v.created_at >= now() - interval '7 days'
where p.created_at >= now() - interval '7 days'
group by p.id;

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
      0::int as comment_count,
      (coalesce(in_count, 0) * 2 - coalesce(out_count, 0)) as score
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
    0::int as comment_count,
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

create or replace function public.fetch_startup_rankings(
  p_window text default '7d',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  rank int,
  startup_id uuid,
  startup_name text,
  category text,
  upvotes int,
  downvotes int,
  comments int,
  score numeric,
  total_count int
)
language sql
stable
as $$
  with normalized as (
    select
      case lower(trim(coalesce(p_window, '7d')))
        when '24h' then now() - interval '24 hours'
        when '7d' then now() - interval '7 days'
        when '30d' then now() - interval '30 days'
        when 'all' then null
        else now() - interval '7 days'
      end as starts_at
  ),
  approved_pitches as (
    select
      s.id as startup_id,
      s.name as startup_name,
      s.category,
      p.id as pitch_id,
      coalesce(p.approved_at, p.created_at) as latest_pitch_at
    from public.pitches p
    join public.startups s on s.id = p.startup_id
    where p.status = 'approved'
      and s.status = 'approved'
      and p.video_path is not null
  ),
  startup_base as (
    select
      startup_id,
      startup_name,
      category,
      max(latest_pitch_at) as latest_pitch_at
    from approved_pitches
    group by startup_id, startup_name, category
  ),
  vote_rows as (
    select pitch_id, vote, created_at
    from public.pitch_votes
    union all
    select pitch_id, vote, created_at
    from public.pitch_guest_votes
  ),
  vote_stats as (
    select
      ap.startup_id,
      count(v.pitch_id) filter (where v.vote = 'in')::int as upvotes,
      count(v.pitch_id) filter (where v.vote = 'out')::int as downvotes
    from approved_pitches ap
    cross join normalized n
    left join vote_rows v
      on v.pitch_id = ap.pitch_id
      and (n.starts_at is null or v.created_at >= n.starts_at)
    group by ap.startup_id
  ),
  scored as (
    select
      sb.startup_id,
      sb.startup_name,
      sb.category,
      coalesce(vs.upvotes, 0) as upvotes,
      coalesce(vs.downvotes, 0) as downvotes,
      0::int as comments,
      ((coalesce(vs.upvotes, 0) * 2)::numeric - coalesce(vs.downvotes, 0)::numeric) as score,
      sb.latest_pitch_at
    from startup_base sb
    left join vote_stats vs on vs.startup_id = sb.startup_id
  ),
  ranked as (
    select
      row_number() over (
        order by
          score desc,
          upvotes desc,
          latest_pitch_at desc,
          startup_name asc
      )::int as rank,
      startup_id,
      startup_name,
      category,
      upvotes,
      downvotes,
      comments,
      round(score, 2) as score,
      count(*) over ()::int as total_count
    from scored
  )
  select
    rank,
    startup_id,
    startup_name,
    category,
    upvotes,
    downvotes,
    comments,
    score,
    total_count
  from ranked
  order by rank
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
