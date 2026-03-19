alter table public.roundtable_members
  add column if not exists camera_state text not null default 'off';

update public.roundtable_members
set camera_state = 'off'
where camera_state is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'roundtable_members_camera_state_check'
  ) then
    alter table public.roundtable_members
      add constraint roundtable_members_camera_state_check
      check (camera_state in ('off', 'live'));
  end if;
end $$;
