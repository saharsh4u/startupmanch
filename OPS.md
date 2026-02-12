# StartupManch Ops (Quick Reference)

This is a one-page operations guide for keeping `startupmanch.com` running.

## Production Source of Truth
- **Vercel project:** `startupmanch1` (this is the only project that should build)
- **Domain:** `startupmanch.com` (primary)
- **Redirect:** `www.startupmanch.com` -> `startupmanch.com`
- **Old project:** `startupmanch` is **disconnected** from Git to avoid duplicate builds.

## Live URLs
- https://startupmanch.com
- https://www.startupmanch.com (redirects to root)

## Vercel (Deployments)
Push to `main` on GitHub. Vercel auto-builds the **startupmanch1** project.

### Vercel Env Vars
Set in **startupmanch1**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Supabase (Backend)
### Storage Buckets
- `pitch-videos` (private)
- `pitch-posters` (public)
- `pitch-decks` (private)

### Admin Email
- `saharashsharma3@gmail.com` (auto role = `admin`)

### Core Tables
`profiles`, `startups`, `pitches`, `pitch_votes`, `pitch_comments`, `investor_requests`

### Pitch Funding Fields
`pitches.ask`, `pitches.equity`, `pitches.valuation`

### Schema Cache Reload
When adding columns:
```sql
select pg_notify('pgrst', 'reload schema');
```

## App Routes (API)
- `POST /api/startups`
- `POST /api/pitches`
- `GET /api/pitches?mode=week|feed&tab=trending|fresh|food|fashion&limit&offset`
- `POST /api/pitches/:id/vote`
- `GET/POST /api/pitches/:id/comments`
- `POST /api/investor/request`
- `POST /api/admin/pitches/:id/approve`
- `POST /api/admin/investors/:id/approve`
- `GET /api/admin/queue`
- `POST /api/admin/approve`
- `POST /api/admin/reject`

## Founder Upload Flow
Page: `/submit`
1. Sign in / Create account
2. Fill startup + pitch details
3. Upload video + optional poster

Upload limits (client-side):
- Video: **50 MB max**
- Poster: **8 MB max**

## Common Fixes
### "Email not confirmed"
Update in Supabase SQL:
```sql
update auth.users
set email_confirmed_at = now()
where email = 'saharashsharma3@gmail.com';
```

### "Database error saving new user"
Ensure signup trigger/policy is correct and profiles are created.
If needed, allow auth admin insert:
```sql
create policy "Allow auth admin insert"
on public.profiles
for insert
to supabase_auth_admin
with check (true);

grant insert on public.profiles to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
```

### "Could not find column in schema cache"
Run:
```sql
select pg_notify('pgrst', 'reload schema');
```

### Upload failed
Usually video too large or bucket policy. Try smaller video first.

## Current Product State (Feb 7, 2026)
### Frontend UI
- **Homepage “Hot video pitches”** layout:
  - Top row: **4 vertical (9:16)** hot-pitch cards
  - Two horizontal **scroll rows** below (5 cards each per row)
  - All cards are vertical and pulled from live approved pitches
- **Ad columns** are sticky while scrolling (desktop).
- **Hero tabs removed** (Trending/Fresh/Food/Fashion are no longer shown under the search).
- **Post pitch CTA** always links to: `https://www.startupmanch.com/submit`

### Live Feed Logic
- **Top row = top 4 winners**
  - Rolling 7 days
  - Score = upvotes - downvotes
  - Minimum 10 votes
- Mosaic uses:
  - Week picks: `/api/pitches?mode=week&limit=4&min_votes=10` + feed
  - Row cards: `/api/pitches?mode=feed&tab=trending&limit=20` (filled to 10 items)

### Admin Workflow
- `/admin` dashboard (combined queue)
  - Approve/Reject both **startup + pitch**
  - Shows founder email, pitch details, video/poster

### Supabase Changes Required
Run in SQL editor if not already:
```sql
-- 7-day stats view
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

-- updated RPC
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

select pg_notify('pgrst', 'reload schema');
```

## Local Dev
```bash
npm install
npm run dev
```

## Files to Know
- Backend schema: `supabase/schema.sql`
- Migrations: `supabase/migrations/`
- Supabase helpers: `src/lib/supabase/`
- Pitch submit page: `src/app/submit/page.tsx`
- Admin queue page: `src/app/admin/page.tsx`
- Pitch arena grid: `src/components/PitchArenaCard.tsx`
- Drawer feed: `src/components/PitchDrawer.tsx`

## Next Roadmap (Suggested)
1. **Public voting + comments**
   - Enable “I’m In / I’m Out” and Boardroom comments on live pitches.
2. **Investor gating**
   - Approve investors + gate deck downloads.
3. **Founder profiles**
   - Public profile page + claim flow.
4. **Quality controls**
   - Require video upload, block empty startups, add retry upload button in admin.
5. **Analytics**
   - Track views, watch time, and conversion metrics.

# Automatic History Loading
Before completing any prompt that involves code changes, reading files,
or task planning, first load the project history and integrate that context.
Remember decisions, code, and prior outputs when producing new responses.
