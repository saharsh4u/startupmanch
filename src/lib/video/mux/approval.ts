import { supabaseAdmin } from "@/lib/supabase/server";
import { createMuxAssetFromUrl } from "@/lib/video/mux/server";

export type VideoProcessingStatus =
  | "pending"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "legacy";

type PitchVideoRow = {
  id: string;
  startup_id: string;
  status: "pending" | "approved" | "rejected";
  video_path: string | null;
  video_processing_status: VideoProcessingStatus | null;
  video_mux_asset_id: string | null;
  video_mux_playback_id: string | null;
};

type Outcome = {
  httpStatus: number;
  body:
    | { status: "approved"; pitchId: string }
    | { status: "queued_for_transcode"; pitchId: string }
    | { error: string };
};

type QueueOptions = {
  force: boolean;
};

const ACTIVE_QUEUE_STATES = new Set<VideoProcessingStatus>(["queued", "processing"]);
const RETRYABLE_STATES = new Set<VideoProcessingStatus>(["failed", "legacy"]);

const normalizeProcessingStatus = (value: string | null | undefined): VideoProcessingStatus => {
  if (value === "queued") return "queued";
  if (value === "processing") return "processing";
  if (value === "ready") return "ready";
  if (value === "failed") return "failed";
  if (value === "legacy") return "legacy";
  return "pending";
};

const mapMuxStatus = (value: string | null | undefined): VideoProcessingStatus => {
  const status = (value ?? "").toLowerCase();
  if (status === "ready") return "ready";
  if (status === "errored") return "failed";
  if (status === "preparing" || status === "processing" || status === "waiting") return "processing";
  return "queued";
};

const readPitchVideoRow = async (pitchId: string): Promise<PitchVideoRow | null> => {
  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select(
      "id,startup_id,status,video_path,video_processing_status,video_mux_asset_id,video_mux_playback_id"
    )
    .eq("id", pitchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as PitchVideoRow | null) ?? null;
};

const signPitchVideoSource = async (videoPath: string) => {
  const { data, error } = await supabaseAdmin.storage.from("pitch-videos").createSignedUrl(videoPath, 20 * 60);
  if (error) {
    throw new Error(error.message);
  }
  const signedUrl = data?.signedUrl?.trim();
  if (!signedUrl) {
    throw new Error("Unable to sign pitch video for transcode");
  }
  return signedUrl;
};

const markPitchApproved = async (pitchId: string, startupId: string, approvedBy: string) => {
  const now = new Date().toISOString();
  const { error: pitchError } = await supabaseAdmin
    .from("pitches")
    .update({
      status: "approved",
      approved_at: now,
      approved_by: approvedBy,
      video_processing_status: "ready",
      video_ready_at: now,
      video_error: null,
    })
    .eq("id", pitchId);

  if (pitchError) {
    throw new Error(pitchError.message);
  }

  const { error: startupError } = await supabaseAdmin
    .from("startups")
    .update({ status: "approved" })
    .eq("id", startupId);

  if (startupError) {
    throw new Error(startupError.message);
  }
};

const queuePitchTranscode = async (pitch: PitchVideoRow, options: QueueOptions) => {
  const processingStatus = normalizeProcessingStatus(pitch.video_processing_status);

  if (!pitch.video_path) {
    throw new Error("Pitch video missing");
  }

  if (!options.force && ACTIVE_QUEUE_STATES.has(processingStatus)) {
    return { status: processingStatus, queued: true as const };
  }

  const signedVideoUrl = await signPitchVideoSource(pitch.video_path);
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

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: mappedStatus,
    queued: mappedStatus === "queued" || mappedStatus === "processing",
    ready: mappedStatus === "ready" && Boolean(muxAsset.playbackId),
  };
};

export const approvePitchWithTranscodeGate = async (input: {
  pitchId: string;
  startupId?: string;
  approvedBy: string;
}): Promise<Outcome> => {
  const pitchId = input.pitchId.trim();
  const startupId = input.startupId?.trim() ?? "";

  if (!pitchId) {
    return {
      httpStatus: 400,
      body: { error: "pitch_id is required" },
    };
  }

  try {
    const pitch = await readPitchVideoRow(pitchId);
    if (!pitch) {
      return { httpStatus: 404, body: { error: "Pitch not found" } };
    }

    if (startupId && pitch.startup_id !== startupId) {
      return { httpStatus: 400, body: { error: "Pitch does not belong to startup_id" } };
    }

    const processingStatus = normalizeProcessingStatus(pitch.video_processing_status);
    const hasReadyPlayback = processingStatus === "ready" && Boolean(pitch.video_mux_playback_id);

    if (hasReadyPlayback) {
      await markPitchApproved(pitch.id, pitch.startup_id, input.approvedBy);
      return { httpStatus: 200, body: { status: "approved", pitchId: pitch.id } };
    }

    if (!pitch.video_path) {
      return { httpStatus: 400, body: { error: "Pitch video is required before approval" } };
    }

    if (ACTIVE_QUEUE_STATES.has(processingStatus)) {
      return { httpStatus: 202, body: { status: "queued_for_transcode", pitchId: pitch.id } };
    }

    const queueResult = await queuePitchTranscode(pitch, { force: false });
    if (queueResult.ready) {
      await markPitchApproved(pitch.id, pitch.startup_id, input.approvedBy);
      return { httpStatus: 200, body: { status: "approved", pitchId: pitch.id } };
    }

    return { httpStatus: 202, body: { status: "queued_for_transcode", pitchId: pitch.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval workflow failed";
    return { httpStatus: 500, body: { error: message } };
  }
};

export const retryPitchTranscode = async (input: { pitchId: string }): Promise<Outcome> => {
  const pitchId = input.pitchId.trim();
  if (!pitchId) {
    return { httpStatus: 400, body: { error: "pitch id is required" } };
  }

  try {
    const pitch = await readPitchVideoRow(pitchId);
    if (!pitch) {
      return { httpStatus: 404, body: { error: "Pitch not found" } };
    }

    if (!pitch.video_path) {
      return { httpStatus: 400, body: { error: "Pitch video is required before retry" } };
    }

    const processingStatus = normalizeProcessingStatus(pitch.video_processing_status);
    if (processingStatus === "ready" && pitch.video_mux_playback_id) {
      return { httpStatus: 200, body: { status: "approved", pitchId: pitch.id } };
    }

    if (ACTIVE_QUEUE_STATES.has(processingStatus)) {
      return { httpStatus: 202, body: { status: "queued_for_transcode", pitchId: pitch.id } };
    }

    if (!RETRYABLE_STATES.has(processingStatus)) {
      return {
        httpStatus: 409,
        body: { error: `Pitch cannot be retried from state ${processingStatus}` },
      };
    }

    await queuePitchTranscode(pitch, { force: true });
    return { httpStatus: 202, body: { status: "queued_for_transcode", pitchId: pitch.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retry workflow failed";
    return { httpStatus: 500, body: { error: message } };
  }
};
