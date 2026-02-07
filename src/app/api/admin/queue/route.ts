import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

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
  startups: any;
};

export async function GET(request: Request) {
  const authContext = await getAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("pitches")
    .select(
      `
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
    `
    )
    .eq("status", "pending")
    .eq("startups.status", "pending")
    .order("created_at", { ascending: true });

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
        video_url,
        poster_url,
      };
    })
  );

  return NextResponse.json({ startups: enriched });
}
