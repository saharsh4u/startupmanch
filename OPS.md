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
- `GET /api/pitches?tab=trending|fresh|food|fashion`
- `POST /api/pitches/:id/vote`
- `GET/POST /api/pitches/:id/comments`
- `POST /api/investor/request`
- `POST /api/admin/pitches/:id/approve`
- `POST /api/admin/investors/:id/approve`

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

