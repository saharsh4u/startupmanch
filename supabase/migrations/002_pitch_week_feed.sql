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

create or replace function public.fetch_pitch_feed(
  mode text default 'feed',
  tab text default 'trending',
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
