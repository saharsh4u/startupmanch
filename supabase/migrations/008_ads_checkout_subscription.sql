do $$ begin
  create type public.ad_campaign_status as enum (
    'checkout_pending',
    'awaiting_details',
    'active',
    'payment_failed',
    'canceled'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text not null,
  billing_email text,
  status public.ad_campaign_status not null default 'checkout_pending',
  company_name text,
  tagline text,
  badge text,
  accent text,
  destination_url text,
  support_email text,
  logo_path text,
  logo_url text,
  details_submitted_at timestamptz,
  activated_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_click_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  side text,
  face text,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists ad_campaigns_status_idx on public.ad_campaigns (status, created_at desc);
create index if not exists ad_campaigns_subscription_idx on public.ad_campaigns (stripe_subscription_id);
create index if not exists ad_click_events_campaign_created_idx on public.ad_click_events (campaign_id, created_at desc);

create or replace function public.touch_ad_campaigns_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_ad_campaigns on public.ad_campaigns;
create trigger trg_touch_ad_campaigns
before update on public.ad_campaigns
for each row execute function public.touch_ad_campaigns_updated_at();
