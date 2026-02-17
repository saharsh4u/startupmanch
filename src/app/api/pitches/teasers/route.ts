import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { applyPublicEdgeCache } from "@/lib/http/cache";
import { buildMuxPlaybackUrl } from "@/lib/video/mux/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVED_LIMIT = 8;
const PENDING_LIMIT = 12;

type ApprovedPitchRow = {
  id: string;
  startup_id: string;
  approved_at: string | null;
  created_at: string;
  poster_path: string | null;
  video_path: string | null;
  video_mux_playback_id?: string | null;
  startups: {
    id: string;
    name: string | null;
    category: string | null;
    one_liner: string | null;
    founder_id: string | null;
    founder_photo_url: string | null;
    founder_story: string | null;
  } | null;
};

type PendingPitchRow = {
  id: string;
  created_at: string;
  poster_path: string | null;
  startups: {
    category: string | null;
  } | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

export async function GET() {
  const [approvedRes, pendingRes] = await Promise.all([
    supabaseAdmin
      .from("pitches")
      .select(
        "id,startup_id,approved_at,created_at,poster_path,video_path,video_mux_playback_id,startups!inner(id,name,category,one_liner,founder_id,founder_photo_url,founder_story)"
      )
      .eq("status", "approved")
      .eq("startups.status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .limit(APPROVED_LIMIT),
    supabaseAdmin
      .from("pitches")
      .select("id,created_at,poster_path,startups!inner(category)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(PENDING_LIMIT),
  ]);

  if (approvedRes.error) {
    return NextResponse.json({ error: approvedRes.error.message }, { status: 500 });
  }
  if (pendingRes.error) {
    return NextResponse.json({ error: pendingRes.error.message }, { status: 500 });
  }

  const approvedRows = (approvedRes.data ?? []) as unknown as ApprovedPitchRow[];
  const pendingRows = (pendingRes.data ?? []) as unknown as PendingPitchRow[];

  const founderIds = Array.from(
    new Set(
      approvedRows
        .map((row) => row.startups?.founder_id ?? null)
        .filter((value): value is string => Boolean(value))
    )
  );

  const founderNameById = new Map<string, string | null>();
  if (founderIds.length) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", founderIds);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    for (const profile of (profileRows ?? []) as ProfileRow[]) {
      founderNameById.set(profile.id, profile.display_name);
    }
  }

  const approved = await Promise.all(
    approvedRows.map(async (row) => {
      let posterUrl: string | null = null;
      let videoUrl: string | null = null;

      if (row.poster_path) {
        const { data: posterData } = await supabaseAdmin.storage
          .from("pitch-posters")
          .createSignedUrl(row.poster_path, 60 * 60);
        posterUrl = posterData?.signedUrl ?? null;
      }

      const muxVideo = buildMuxPlaybackUrl(row.video_mux_playback_id ?? null);
      if (muxVideo) {
        videoUrl = muxVideo;
      } else if (row.video_path) {
        const { data: videoData } = await supabaseAdmin.storage
          .from("pitch-videos")
          .createSignedUrl(row.video_path, 60 * 60);
        videoUrl = videoData?.signedUrl ?? null;
      }

      const founderId = row.startups?.founder_id ?? null;
      const founderName = founderId ? founderNameById.get(founderId) ?? null : null;

      return {
        id: row.id,
        startup_name: row.startups?.name ?? "Startup",
        category: row.startups?.category ?? null,
        one_liner: row.startups?.one_liner ?? null,
        founder_name: founderName,
        founder_photo_url: row.startups?.founder_photo_url ?? null,
        founder_story: row.startups?.founder_story ?? null,
        approved_at: row.approved_at,
        created_at: row.created_at,
        poster_url: posterUrl,
        video_url: videoUrl,
      };
    })
  );

  const pending = await Promise.all(
    pendingRows.map(async (row, index) => {
      let posterUrl: string | null = null;
      if (row.poster_path) {
        const { data: posterData } = await supabaseAdmin.storage
          .from("pitch-posters")
          .createSignedUrl(row.poster_path, 20 * 60);
        posterUrl = posterData?.signedUrl ?? null;
      }

      return {
        id: `pending-${row.id}`,
        category: row.startups?.category ?? null,
        created_at: row.created_at,
        poster_url: posterUrl,
        style_key: `pending-${index + 1}`,
      };
    })
  );

  const response = NextResponse.json({
    approved,
    pending,
    server_time: new Date().toISOString(),
  });
  applyPublicEdgeCache(response, {
    sMaxAgeSeconds: 45,
    staleWhileRevalidateSeconds: 180,
  });
  return response;
}
