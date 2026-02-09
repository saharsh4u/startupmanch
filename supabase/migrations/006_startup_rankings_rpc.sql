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
  vote_stats as (
    select
      ap.startup_id,
      count(v.id) filter (where v.vote = 'in')::int as upvotes,
      count(v.id) filter (where v.vote = 'out')::int as downvotes
    from approved_pitches ap
    cross join normalized n
    left join public.pitch_votes v
      on v.pitch_id = ap.pitch_id
      and (n.starts_at is null or v.created_at >= n.starts_at)
    group by ap.startup_id
  ),
  comment_stats as (
    select
      ap.startup_id,
      count(c.id)::int as comments
    from approved_pitches ap
    cross join normalized n
    left join public.pitch_comments c
      on c.pitch_id = ap.pitch_id
      and (n.starts_at is null or c.created_at >= n.starts_at)
    group by ap.startup_id
  ),
  scored as (
    select
      sb.startup_id,
      sb.startup_name,
      sb.category,
      coalesce(vs.upvotes, 0) as upvotes,
      coalesce(vs.downvotes, 0) as downvotes,
      coalesce(cs.comments, 0) as comments,
      (
        (coalesce(vs.upvotes, 0) * 2)::numeric
        - coalesce(vs.downvotes, 0)::numeric
        + (coalesce(cs.comments, 0) * 1.5)::numeric
      ) as score,
      sb.latest_pitch_at
    from startup_base sb
    left join vote_stats vs on vs.startup_id = sb.startup_id
    left join comment_stats cs on cs.startup_id = sb.startup_id
  ),
  ranked as (
    select
      row_number() over (
        order by
          score desc,
          upvotes desc,
          comments desc,
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
