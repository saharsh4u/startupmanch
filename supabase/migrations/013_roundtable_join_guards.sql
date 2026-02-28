-- Roundtable join guardrails:
-- 1) cleanup any duplicate active joined rows
-- 2) enforce one active seat per actor per session via partial unique indexes
-- 3) add lookup indexes used by join resolution paths

-- Keep newest joined row per (session_id, seat_no), mark older as left.
with ranked_seat as (
  select
    id,
    row_number() over (
      partition by session_id, seat_no
      order by joined_at desc, id desc
    ) as rn
  from public.roundtable_members
  where state = 'joined'
),
seat_duplicates as (
  select id
  from ranked_seat
  where rn > 1
)
update public.roundtable_members as m
set
  state = 'left',
  left_at = coalesce(m.left_at, now())
from seat_duplicates as d
where m.id = d.id;

-- Keep newest joined row per (session_id, guest_id), mark older as left.
with ranked_guest as (
  select
    id,
    row_number() over (
      partition by session_id, guest_id
      order by joined_at desc, id desc
    ) as rn
  from public.roundtable_members
  where state = 'joined'
    and guest_id is not null
),
guest_duplicates as (
  select id
  from ranked_guest
  where rn > 1
)
update public.roundtable_members as m
set
  state = 'left',
  left_at = coalesce(m.left_at, now())
from guest_duplicates as d
where m.id = d.id;

-- Keep newest joined row per (session_id, profile_id), mark older as left.
with ranked_profile as (
  select
    id,
    row_number() over (
      partition by session_id, profile_id
      order by joined_at desc, id desc
    ) as rn
  from public.roundtable_members
  where state = 'joined'
    and profile_id is not null
),
profile_duplicates as (
  select id
  from ranked_profile
  where rn > 1
)
update public.roundtable_members as m
set
  state = 'left',
  left_at = coalesce(m.left_at, now())
from profile_duplicates as d
where m.id = d.id;

create unique index if not exists roundtable_members_joined_session_seat_uidx
  on public.roundtable_members (session_id, seat_no)
  where state = 'joined';

create unique index if not exists roundtable_members_joined_session_guest_uidx
  on public.roundtable_members (session_id, guest_id)
  where state = 'joined' and guest_id is not null;

create unique index if not exists roundtable_members_joined_session_profile_uidx
  on public.roundtable_members (session_id, profile_id)
  where state = 'joined' and profile_id is not null;

create index if not exists roundtable_members_session_state_guest_idx
  on public.roundtable_members (session_id, state, guest_id);

create index if not exists roundtable_members_session_state_profile_idx
  on public.roundtable_members (session_id, state, profile_id);
