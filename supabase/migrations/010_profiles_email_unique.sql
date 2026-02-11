-- Normalize profile emails for provider-agnostic identity matching
update public.profiles
set email = lower(trim(email))
where email is not null
  and email <> lower(trim(email));

-- Enforce one profile per normalized email when email is present
create unique index if not exists profiles_email_lower_unique_idx
on public.profiles (lower(email))
where email is not null;
