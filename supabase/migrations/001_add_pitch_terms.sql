alter table public.pitches
  add column if not exists ask text,
  add column if not exists equity text,
  add column if not exists valuation text;
