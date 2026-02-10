import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildMuxPlaybackUrl } from "@/lib/video/mux/server";

export const runtime = "nodejs";

const isMissingVideoProcessingColumnError = (message: string | null | undefined) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("video_processing_status") ||
    normalized.includes("video_mux_playback_id")
  );
};

type DetailResponse = {
  pitch: {
    id: string;
    ask: string | null;
    equity: string | null;
    valuation: string | null;
    video_url: string | null;
    poster_url: string | null;
    created_at: string;
  };
  startup: {
    id: string;
    name: string;
    category: string | null;
    city: string | null;
    one_liner: string | null;
    website: string | null;
    founder_story: string | null;
    monthly_revenue: string | null;
    social_links: Record<string, string | null> | null;
    founder_photo_url: string | null;
  };
  founder: {
    display_name: string | null;
    city: string | null;
  };
  stats: {
    in_count: number;
    out_count: number;
    comment_count: number;
  };
};

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Pitch id is required" }, { status: 400 });
  }

  const { data: pitchRow, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .select(
      `
        id, ask, equity, valuation, video_path, poster_path, created_at,
        startup:startup_id (
          id, name, category, city, one_liner, website, founder_story, monthly_revenue,
          social_links, founder_photo_url, founder_id
        )
      `
    )
    .eq("id", id)
    .single();

  if (pitchError || !pitchRow) {
    return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
  }

  const startup = (pitchRow as any).startup;
  if (!startup) {
    return NextResponse.json({ error: "Startup not found for pitch" }, { status: 404 });
  }

  let video_url: string | null = null;
  let poster_url: string | null = null;

  let videoProcessingStatus: string | null = null;
  let videoMuxPlaybackId: string | null = null;

  const { data: videoStateRow, error: videoStateError } = await supabaseAdmin
    .from("pitches")
    .select("video_processing_status,video_mux_playback_id")
    .eq("id", id)
    .maybeSingle();

  if (videoStateError && !isMissingVideoProcessingColumnError(videoStateError.message)) {
    return NextResponse.json({ error: videoStateError.message }, { status: 500 });
  }

  if (videoStateRow) {
    videoProcessingStatus = (videoStateRow as any).video_processing_status ?? null;
    videoMuxPlaybackId = (videoStateRow as any).video_mux_playback_id ?? null;
  }

  const muxPlaybackUrl = buildMuxPlaybackUrl(videoMuxPlaybackId);
  if (videoProcessingStatus === "ready" && muxPlaybackUrl) {
    video_url = muxPlaybackUrl;
  } else if (pitchRow.video_path) {
    const { data } = await supabaseAdmin.storage
      .from("pitch-videos")
      .createSignedUrl(pitchRow.video_path, 60 * 60);
    video_url = data?.signedUrl ?? null;
  }

  if (pitchRow.poster_path) {
    const { data } = await supabaseAdmin.storage
      .from("pitch-posters")
      .createSignedUrl(pitchRow.poster_path, 60 * 60);
    poster_url = data?.signedUrl ?? null;
  }

  const { data: statsRow } = await supabaseAdmin
    .from("pitch_stats")
    .select("in_count, out_count, comment_count")
    .eq("pitch_id", id)
    .single();

  let founder = { display_name: null as string | null, city: null as string | null };
  if (startup.founder_id) {
    const { data: founderRow } = await supabaseAdmin
      .from("profiles")
      .select("display_name, city")
      .eq("id", startup.founder_id)
      .single();
    if (founderRow) {
      founder = { display_name: founderRow.display_name, city: founderRow.city };
    }
  }

  const payload: DetailResponse = {
    pitch: {
      id: pitchRow.id,
      ask: pitchRow.ask,
      equity: pitchRow.equity,
      valuation: pitchRow.valuation,
      video_url,
      poster_url,
      created_at: pitchRow.created_at,
    },
    startup: {
      id: startup.id,
      name: startup.name,
      category: startup.category,
      city: startup.city,
      one_liner: startup.one_liner,
      website: startup.website,
      founder_story: startup.founder_story,
      monthly_revenue: startup.monthly_revenue,
      social_links: startup.social_links,
      founder_photo_url: startup.founder_photo_url,
    },
    founder,
    stats: {
      in_count: statsRow?.in_count ?? 0,
      out_count: statsRow?.out_count ?? 0,
      comment_count: statsRow?.comment_count ?? 0,
    },
  };

  return NextResponse.json(payload);
}
