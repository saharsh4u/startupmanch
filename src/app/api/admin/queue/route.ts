import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

type QueueRowRaw = {
  id: string;
  startup_id: string;
  type: string;
  duration_sec: number | null;
  ask: string | null;
  equity: string | null;
  valuation: string | null;
  video_path: string | null;
  poster_path: string | null;
  video_processing_status?: string | null;
  video_error?: string | null;
  startups: any;
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

export async function GET(request: Request) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const selectWithVideoProcessing = `
    id,
    startup_id,
    type,
    duration_sec,
    ask,
    equity,
    valuation,
    video_path,
    poster_path,
    video_processing_status,
    video_error,
    startups!inner (
      id,
      name,
      category,
      city,
      status,
      profiles!startups_founder_id_fkey ( email )
    )
  `;

  const selectLegacy = `
    id,
    startup_id,
    type,
    duration_sec,
    ask,
    equity,
    valuation,
    video_path,
    poster_path,
    startups!inner (
      id,
      name,
      category,
      city,
      status,
      profiles!startups_founder_id_fkey ( email )
    )
  `;

  let data: any = null;
  let error: any = null;

  {
    const res = await supabaseAdmin
      .from("pitches")
      .select(selectWithVideoProcessing)
      .eq("status", "pending")
      .eq("startups.status", "pending")
      .order("created_at", { ascending: true });
    data = res.data;
    error = res.error;
  }

  if (error && isMissingVideoProcessingColumnError(error.message)) {
    const fallback = await supabaseAdmin
      .from("pitches")
      .select(selectLegacy)
      .eq("status", "pending")
      .eq("startups.status", "pending")
      .order("created_at", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as QueueRowRaw[];

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const startup = Array.isArray(row.startups) ? row.startups[0] : row.startups;
      const founderProfile = Array.isArray(startup?.profiles)
        ? startup.profiles[0]
        : startup?.profiles;
      let video_url: string | null = null;
      let poster_url: string | null = null;

      if (row.video_path) {
        const { data: signedVideo } = await supabaseAdmin.storage
          .from("pitch-videos")
          .createSignedUrl(row.video_path, 60 * 60);
        video_url = signedVideo?.signedUrl ?? null;
      }

      if (row.poster_path) {
        const { data: signedPoster } = await supabaseAdmin.storage
          .from("pitch-posters")
          .createSignedUrl(row.poster_path, 60 * 60);
        poster_url = signedPoster?.signedUrl ?? null;
      }

      return {
        startup_id: row.startup_id,
        startup_name: startup?.name ?? "Unknown",
        category: startup?.category ?? null,
        city: startup?.city ?? null,
        founder_email: founderProfile?.email ?? null,
        pitch_id: row.id,
        pitch_type: row.type,
        duration_sec: row.duration_sec,
        ask: row.ask,
        equity: row.equity,
        valuation: row.valuation,
        video_path: row.video_path,
        poster_path: row.poster_path,
        video_processing_status: row.video_processing_status ?? null,
        video_error: row.video_error ?? null,
        video_url,
        poster_url,
      };
    })
  );

  return NextResponse.json({ startups: enriched });
}
