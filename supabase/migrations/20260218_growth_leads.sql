create table if not exists public.growth_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  persona text not null check (persona in ('founder', 'investor', 'both')),
  intent text not null,
  source text not null,
  utm jsonb,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists growth_leads_email_created_at_idx
  on public.growth_leads (email, created_at desc);

create index if not exists growth_leads_ip_hash_created_at_idx
  on public.growth_leads (ip_hash, created_at desc);
