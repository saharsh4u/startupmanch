-- Revenue verification tables
create type if not exists public.revenue_provider as enum ('stripe', 'razorpay');

create table if not exists public.revenue_connections (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  provider revenue_provider not null,
  api_key_ciphertext text not null,
  status text not null default 'active' check (status in ('active', 'error', 'revoked')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (startup_id, provider)
);

create table if not exists public.revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null references public.startups(id) on delete cascade,
  provider revenue_provider not null,
  period_start date not null,
  period_end date not null,
  currency text not null default 'usd',
  gross_revenue numeric not null default 0,
  net_revenue numeric not null default 0,
  mrr numeric,
  active_subscriptions int,
  synced_at timestamptz not null default now(),
  unique (startup_id, provider, period_start)
);

create index if not exists revenue_snapshots_startup_idx on public.revenue_snapshots (startup_id, period_start desc);
create index if not exists revenue_connections_startup_idx on public.revenue_connections (startup_id);

-- trigger to keep updated_at fresh
create or replace function public.touch_revenue_connections()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_revenue_connections on public.revenue_connections;
create trigger trg_touch_revenue_connections
before update on public.revenue_connections
for each row execute function public.touch_revenue_connections();
