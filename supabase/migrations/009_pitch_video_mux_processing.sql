do $$ begin
  create type public.video_processing_status as enum (
    'pending',
    'queued',
    'processing',
    'ready',
    'failed',
    'legacy'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.pitches
  add column if not exists video_processing_status public.video_processing_status not null default 'pending',
  add column if not exists video_mux_asset_id text,
  add column if not exists video_mux_playback_id text,
  add column if not exists video_error text,
  add column if not exists video_transcode_requested_at timestamptz,
  add column if not exists video_ready_at timestamptz;

create unique index if not exists pitches_video_mux_asset_id_key
  on public.pitches (video_mux_asset_id)
  where video_mux_asset_id is not null;

create unique index if not exists pitches_video_mux_playback_id_key
  on public.pitches (video_mux_playback_id)
  where video_mux_playback_id is not null;

update public.pitches
set video_processing_status = 'legacy'
where status = 'approved'
  and video_path is not null
  and (video_processing_status = 'pending' or video_processing_status is null);

update public.pitches
set video_processing_status = 'pending'
where status = 'pending'
  and video_path is not null
  and (video_processing_status = 'pending' or video_processing_status is null);
