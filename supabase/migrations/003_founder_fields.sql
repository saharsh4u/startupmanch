-- Add founder/profile fields to startups
alter table public.startups
  add column if not exists founder_photo_url text,
  add column if not exists founder_story text,
  add column if not exists monthly_revenue text,
  add column if not exists social_links jsonb;

