import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const validTabs = new Set(["trending", "fresh", "food", "fashion"]);
const validModes = new Set(["week", "feed"]);

type PitchFeedItem = {
  pitch_id: string;
  startup_id: string;
  startup_name: string;
  category: string | null;
  city: string | null;
  one_liner: string | null;
  video_path: string | null;
  poster_path: string | null;
  created_at: string;
  in_count: number;
  out_count: number;
  comment_count: number;
  score: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = searchParams.get("mode") ?? "feed";
  const tab = searchParams.get("tab") ?? "trending";
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const offsetParam = Number(searchParams.get("offset") ?? "0");
  const minVotesParam = Number(searchParams.get("min_votes") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;
  const minVotes = Number.isFinite(minVotesParam) ? Math.max(minVotesParam, 0) : 10;

  const safeTab = validTabs.has(tab) ? tab : "trending";
  const safeMode = validModes.has(modeParam) ? modeParam : "feed";

  const { data, error } = await supabaseAdmin.rpc("fetch_pitch_feed", {
    mode: safeMode,
    tab: safeTab,
    max_items: limit,
    offset_items: offset,
    min_votes: minVotes,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PitchFeedItem[];
  const enriched = await Promise.all(
    rows.map(async (item: PitchFeedItem) => {
      let video_url: string | null = null;
      let poster_url: string | null = null;

      if (item.video_path) {
        const { data: signedVideo } = await supabaseAdmin.storage
          .from("pitch-videos")
          .createSignedUrl(item.video_path, 60 * 60);
        video_url = signedVideo?.signedUrl ?? null;
      }

      if (item.poster_path) {
        const { data: signedPoster } = await supabaseAdmin.storage
          .from("pitch-posters")
          .createSignedUrl(item.poster_path, 60 * 60);
        poster_url = signedPoster?.signedUrl ?? null;
      }

      return {
        ...item,
        video_url,
        poster_url,
      };
    })
  );

  return NextResponse.json({ mode: safeMode, tab: safeTab, data: enriched, offset, limit });
}

export async function POST(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["founder", "admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const { startup_id, type, duration_sec, ask, equity, valuation } = payload ?? {};

  if (!startup_id || typeof startup_id !== "string") {
    return NextResponse.json({ error: "startup_id is required" }, { status: 400 });
  }

  const { data: startup, error: startupError } = await supabaseAdmin
    .from("startups")
    .select("id, founder_id, status")
    .eq("id", startup_id)
    .single();

  if (startupError || !startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  if (startup.founder_id !== authContext.userId && authContext.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: pitch, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .insert({
      startup_id,
      type: type === "demo" ? "demo" : "elevator",
      duration_sec: typeof duration_sec === "number" ? duration_sec : null,
      ask: typeof ask === "string" ? ask : null,
      equity: typeof equity === "string" ? equity : null,
      valuation: typeof valuation === "string" ? valuation : null,
      status: "pending",
    })
    .select("id, startup_id, type, status, created_at")
    .single();

  if (pitchError || !pitch) {
    return NextResponse.json({ error: pitchError?.message ?? "Unable to create pitch" }, { status: 500 });
  }

  const basePath = `${startup_id}/${pitch.id}`;
  const videoPath = `${basePath}.mp4`;
  const posterPath = `${basePath}.jpg`;

  const { data: videoUpload, error: videoError } = await supabaseAdmin.storage
    .from("pitch-videos")
    .createSignedUploadUrl(videoPath);

  const { data: posterUpload, error: posterError } = await supabaseAdmin.storage
    .from("pitch-posters")
    .createSignedUploadUrl(posterPath);

  if (videoError || posterError) {
    return NextResponse.json(
      { error: videoError?.message ?? posterError?.message ?? "Unable to create upload URLs" },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("pitches")
    .update({
      video_path: videoPath,
      poster_path: posterPath,
    })
    .eq("id", pitch.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    pitch: {
      ...pitch,
      video_path: videoPath,
      poster_path: posterPath,
    },
    uploads: {
      video: videoUpload,
      poster: posterUpload,
    },
  });
}
