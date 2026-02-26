import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { normalizeInstagramUrl } from "@/lib/video/instagram";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const startupId =
    payload && typeof payload.startup_id === "string" ? payload.startup_id.trim() : "";
  const instagramUrl = normalizeInstagramUrl(
    payload && typeof payload.instagram_url === "string" ? payload.instagram_url : null
  );

  if (!startupId) {
    return NextResponse.json({ error: "startup_id is required" }, { status: 400 });
  }
  if (!instagramUrl) {
    return NextResponse.json(
      { error: "Valid Instagram Reel/Post URL is required (instagram.com/reel/... or /p/...)." },
      { status: 400 }
    );
  }

  const { data: startup, error: startupError } = await supabaseAdmin
    .from("startups")
    .select("id,name,status")
    .eq("id", startupId)
    .single();

  if (startupError || !startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  if (startup.status !== "approved") {
    const { error: startupUpdateError } = await supabaseAdmin
      .from("startups")
      .update({ status: "approved" })
      .eq("id", startupId);
    if (startupUpdateError) {
      return NextResponse.json({ error: startupUpdateError.message }, { status: 500 });
    }
  }

  const nowIso = new Date().toISOString();
  const insertWithProcessing = {
    startup_id: startupId,
    type: "elevator" as const,
    duration_sec: 60,
    status: "approved" as const,
    approved_at: nowIso,
    approved_by: authContext.userId,
    video_path: instagramUrl,
    video_processing_status: "ready",
    video_ready_at: nowIso,
    video_error: null,
    video_mux_asset_id: null,
    video_mux_playback_id: null,
  };

  const insertLegacy = {
    startup_id: startupId,
    type: "elevator" as const,
    duration_sec: 60,
    status: "approved" as const,
    approved_at: nowIso,
    approved_by: authContext.userId,
    video_path: instagramUrl,
  };

  let inserted: { id: string; startup_id: string; approved_at: string | null } | null = null;
  {
    const { data, error } = await supabaseAdmin
      .from("pitches")
      .insert(insertWithProcessing)
      .select("id,startup_id,approved_at")
      .single();

    if (!error) {
      inserted = data;
    } else if (isMissingVideoProcessingColumnError(error.message)) {
      const fallback = await supabaseAdmin
        .from("pitches")
        .insert(insertLegacy)
        .select("id,startup_id,approved_at")
        .single();

      if (fallback.error || !fallback.data) {
        return NextResponse.json(
          { error: fallback.error?.message ?? "Unable to publish Instagram embed." },
          { status: 500 }
        );
      }

      inserted = fallback.data;
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (!inserted) {
    return NextResponse.json({ error: "Unable to publish Instagram embed." }, { status: 500 });
  }

  return NextResponse.json({
    pitch: {
      id: inserted.id,
      startup_id: inserted.startup_id,
      approved_at: inserted.approved_at,
      instagram_url: instagramUrl,
      startup_name: startup.name ?? "Startup",
    },
    published: true,
  });
}
