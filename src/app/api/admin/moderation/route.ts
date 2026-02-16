import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

type ModerationRowRaw = {
  id: string;
  startup_id: string;
  status: string;
  type: string;
  duration_sec: number | null;
  ask: string | null;
  equity: string | null;
  valuation: string | null;
  approved_at: string | null;
  created_at: string | null;
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

const parseLimit = (value: string | null) => {
  const parsed = Number(value ?? "40");
  if (!Number.isFinite(parsed)) return 40;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
};

export async function GET(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  const selectWithVideoProcessing = `
    id,
    startup_id,
    status,
    type,
    duration_sec,
    ask,
    equity,
    valuation,
    approved_at,
    created_at,
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
    status,
    type,
    duration_sec,
    ask,
    equity,
    valuation,
    approved_at,
    created_at,
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
      .eq("status", "approved")
      .eq("startups.status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    data = res.data;
    error = res.error;
  }

  if (error && isMissingVideoProcessingColumnError(error.message)) {
    const fallback = await supabaseAdmin
      .from("pitches")
      .select(selectLegacy)
      .eq("status", "approved")
      .eq("startups.status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as ModerationRowRaw[];
  const items = await Promise.all(
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
        startup_status: startup?.status ?? null,
        pitch_id: row.id,
        pitch_status: row.status ?? null,
        pitch_type: row.type,
        duration_sec: row.duration_sec,
        ask: row.ask,
        equity: row.equity,
        valuation: row.valuation,
        approved_at: row.approved_at ?? null,
        created_at: row.created_at ?? null,
        video_path: row.video_path,
        poster_path: row.poster_path,
        video_processing_status: row.video_processing_status ?? null,
        video_error: row.video_error ?? null,
        video_url,
        poster_url,
      };
    })
  );

  return NextResponse.json({ items });
}
