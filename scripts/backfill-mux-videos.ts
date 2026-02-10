import { supabaseAdmin } from "../src/lib/supabase/server";
import { createMuxAssetFromUrl } from "../src/lib/video/mux/server";

type VideoProcessingStatus = "pending" | "queued" | "processing" | "ready" | "failed" | "legacy";

type PitchBackfillRow = {
  id: string;
  video_path: string | null;
  status: "pending" | "approved" | "rejected";
  video_processing_status: VideoProcessingStatus | null;
  video_mux_asset_id: string | null;
  video_mux_playback_id: string | null;
  created_at: string;
};

type CliOptions = {
  dryRun: boolean;
  batchSize: number;
  maxBatches: number;
};

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_BATCHES = 1;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
};

const parseOptions = (args: string[]): CliOptions => {
  let dryRun = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let maxBatches = DEFAULT_MAX_BATCHES;

  for (const rawArg of args) {
    const arg = rawArg.trim();
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--batch-size=")) {
      batchSize = parsePositiveInteger(arg.split("=")[1], DEFAULT_BATCH_SIZE);
      continue;
    }
    if (arg.startsWith("--max-batches=")) {
      maxBatches = parsePositiveInteger(arg.split("=")[1], DEFAULT_MAX_BATCHES);
      continue;
    }
  }

  return { dryRun, batchSize, maxBatches };
};

const mapMuxStatus = (value: string | null | undefined): VideoProcessingStatus => {
  const status = (value ?? "").toLowerCase();
  if (status === "ready") return "ready";
  if (status === "errored") return "failed";
  if (status === "preparing" || status === "processing" || status === "waiting") return "processing";
  return "queued";
};

const listBackfillCandidates = async (batchSize: number, offset: number) => {
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select(
      "id,video_path,status,video_processing_status,video_mux_asset_id,video_mux_playback_id,created_at"
    )
    .eq("status", "approved")
    .not("video_path", "is", null)
    .or("video_processing_status.eq.legacy,video_mux_playback_id.is.null")
    .order("created_at", { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PitchBackfillRow[];
};

const signVideoSource = async (videoPath: string) => {
  const { data, error } = await supabaseAdmin.storage.from("pitch-videos").createSignedUrl(videoPath, 20 * 60);
  if (error) throw new Error(error.message);
  const signedUrl = data?.signedUrl?.trim();
  if (!signedUrl) throw new Error("Signed video URL missing");
  return signedUrl;
};

const processPitch = async (pitch: PitchBackfillRow, dryRun: boolean) => {
  if (!pitch.video_path) {
    return { action: "skip_no_video" as const };
  }

  const processingStatus = pitch.video_processing_status ?? "pending";
  if (pitch.video_mux_asset_id && processingStatus !== "failed") {
    return { action: "skip_existing_asset" as const };
  }

  if (dryRun) {
    return { action: "dry_run_queue" as const };
  }

  const signedVideoUrl = await signVideoSource(pitch.video_path);
  const muxAsset = await createMuxAssetFromUrl({
    inputUrl: signedVideoUrl,
    passthroughPitchId: pitch.id,
  });

  const mappedStatus = mapMuxStatus(muxAsset.status);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("pitches")
    .update({
      video_mux_asset_id: muxAsset.assetId,
      video_mux_playback_id: muxAsset.playbackId,
      video_processing_status: mappedStatus,
      video_transcode_requested_at: now,
      video_ready_at: mappedStatus === "ready" ? now : null,
      video_error: null,
    })
    .eq("id", pitch.id);

  if (error) throw new Error(error.message);

  return { action: mappedStatus === "ready" ? ("ready" as const) : ("queued" as const) };
};

const run = async () => {
  const options = parseOptions(process.argv.slice(2));
  const summary = {
    inspected: 0,
    queued: 0,
    ready: 0,
    skipped: 0,
    failed: 0,
  };

  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    const offset = batch * options.batchSize;
    const rows = await listBackfillCandidates(options.batchSize, offset);
    if (!rows.length) break;

    for (const row of rows) {
      summary.inspected += 1;
      try {
        const result = await processPitch(row, options.dryRun);
        if (result.action === "queued" || result.action === "dry_run_queue") summary.queued += 1;
        else if (result.action === "ready") summary.ready += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : "Unknown error";
        // eslint-disable-next-line no-console
        console.error(`[backfill-mux] ${row.id} failed: ${message}`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[backfill-mux] done inspected=${summary.inspected} queued=${summary.queued} ready=${summary.ready} skipped=${summary.skipped} failed=${summary.failed} dryRun=${options.dryRun}`
  );
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Backfill failed";
  // eslint-disable-next-line no-console
  console.error(`[backfill-mux] fatal: ${message}`);
  process.exitCode = 1;
});
