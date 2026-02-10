import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMuxWebhookSignature } from "@/lib/video/mux/server";

export const runtime = "nodejs";

type MuxPlaybackId = {
  id?: string;
  policy?: string;
};

type MuxWebhookEvent = {
  type?: string;
  data?: {
    id?: string;
    passthrough?: string | null;
    playback_ids?: MuxPlaybackId[] | null;
    errors?: {
      type?: string;
      messages?: string[];
    } | null;
  };
};

type PitchLookup = {
  id: string;
  startup_id: string;
};

const isMissingVideoProcessingColumnError = (message: string | null | undefined) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("video_processing_status") ||
    normalized.includes("video_mux_asset_id") ||
    normalized.includes("video_mux_playback_id") ||
    normalized.includes("video_transcode_requested_at") ||
    normalized.includes("video_ready_at") ||
    normalized.includes("video_error")
  );
};

const pickPlaybackId = (items: MuxPlaybackId[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const publicPlayback = items.find((item) => item?.policy === "public" && item?.id);
  if (publicPlayback?.id) return publicPlayback.id;
  const first = items.find((item) => item?.id);
  return first?.id ?? null;
};

const resolveErrorMessage = (payload: MuxWebhookEvent) => {
  const messages = payload.data?.errors?.messages;
  if (Array.isArray(messages) && typeof messages[0] === "string" && messages[0].trim().length) {
    return messages[0].trim();
  }
  if (payload.data?.errors?.type && payload.data.errors.type.trim().length) {
    return payload.data.errors.type.trim();
  }
  return "Mux asset errored";
};

const findPitchByAsset = async (assetId: string, passthroughPitchId: string | null) => {
  const { data: byAsset, error: byAssetError } = await supabaseAdmin
    .from("pitches")
    .select("id,startup_id")
    .eq("video_mux_asset_id", assetId)
    .maybeSingle();

  if (byAssetError) {
    throw new Error(byAssetError.message);
  }
  if (byAsset) return byAsset as PitchLookup;

  if (!passthroughPitchId) return null;

  const { data: byPitchId, error: byPitchIdError } = await supabaseAdmin
    .from("pitches")
    .select("id,startup_id")
    .eq("id", passthroughPitchId)
    .maybeSingle();

  if (byPitchIdError) {
    throw new Error(byPitchIdError.message);
  }

  return (byPitchId as PitchLookup | null) ?? null;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!verifyMuxWebhookSignature(rawBody, request.headers)) {
      return NextResponse.json({ error: "Invalid Mux webhook signature" }, { status: 401 });
    }

    if (!rawBody.trim().length) {
      return NextResponse.json({ received: true, ignored: "empty_body" });
    }

    const payload = JSON.parse(rawBody) as MuxWebhookEvent;
    const eventType = payload.type?.trim() ?? "";
    if (!eventType.startsWith("video.asset.")) {
      return NextResponse.json({ received: true, ignored: "unsupported_event_type" });
    }

    const assetId = payload.data?.id?.trim();
    if (!assetId) {
      return NextResponse.json({ received: true, ignored: "missing_asset_id" });
    }

    const passthroughPitchId = payload.data?.passthrough?.trim() || null;
    const pitch = await findPitchByAsset(assetId, passthroughPitchId);
    if (!pitch) {
      return NextResponse.json({ received: true, ignored: "pitch_not_found" });
    }

    if (eventType === "video.asset.ready") {
      const playbackId = pickPlaybackId(payload.data?.playback_ids);
      if (!playbackId) {
        const { error: missingPlaybackError } = await supabaseAdmin
          .from("pitches")
          .update({
            video_mux_asset_id: assetId,
            video_processing_status: "failed",
            video_error: "Mux ready event missing playback id",
          })
          .eq("id", pitch.id);

        if (missingPlaybackError) {
          throw new Error(missingPlaybackError.message);
        }

        return NextResponse.json({ received: true, status: "failed_missing_playback_id" });
      }

      const now = new Date().toISOString();
      const { error: muxUpdateError } = await supabaseAdmin
        .from("pitches")
        .update({
          video_mux_asset_id: assetId,
          video_mux_playback_id: playbackId,
          video_processing_status: "ready",
          video_ready_at: now,
          video_error: null,
        })
        .eq("id", pitch.id);

      if (muxUpdateError) {
        throw new Error(muxUpdateError.message);
      }

      // Only auto-approve if the pitch is still pending (avoid clobbering rejected/approved).
      const { error: approvePitchError } = await supabaseAdmin
        .from("pitches")
        .update({ status: "approved", approved_at: now })
        .eq("id", pitch.id)
        .eq("status", "pending");

      if (approvePitchError) {
        throw new Error(approvePitchError.message);
      }

      // Only update startups that are still pending (avoid clobbering rejected/approved).
      const { error: startupError } = await supabaseAdmin
        .from("startups")
        .update({ status: "approved" })
        .eq("id", pitch.startup_id)
        .eq("status", "pending");

      if (startupError) {
        throw new Error(startupError.message);
      }

      return NextResponse.json({ received: true, status: "ready" });
    }

    if (eventType === "video.asset.errored") {
      const { error: pitchError } = await supabaseAdmin
        .from("pitches")
        .update({
          video_mux_asset_id: assetId,
          video_processing_status: "failed",
          video_error: resolveErrorMessage(payload),
        })
        .eq("id", pitch.id);

      if (pitchError) {
        throw new Error(pitchError.message);
      }

      return NextResponse.json({ received: true, status: "errored" });
    }

    if (eventType === "video.asset.created" || eventType === "video.asset.updated") {
      const { error: pitchError } = await supabaseAdmin
        .from("pitches")
        .update({
          video_mux_asset_id: assetId,
          video_processing_status: "processing",
          video_error: null,
        })
        .eq("id", pitch.id)
        .neq("video_processing_status", "ready");

      if (pitchError) {
        throw new Error(pitchError.message);
      }
    }

    return NextResponse.json({ received: true, status: "ignored_event" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mux webhook failed";
    if (isMissingVideoProcessingColumnError(message)) {
      return NextResponse.json({ received: true, ignored: "missing_video_processing_columns" });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
