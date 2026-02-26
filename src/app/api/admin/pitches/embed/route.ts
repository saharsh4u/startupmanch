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
  const startupIdInput =
    payload && typeof payload.startup_id === "string" ? payload.startup_id.trim() : "";
  const startupNameInput =
    payload && typeof payload.startup_name === "string" ? payload.startup_name.trim() : "";
  const instagramUrl = normalizeInstagramUrl(
    payload && typeof payload.instagram_url === "string" ? payload.instagram_url : null
  );

  if (!startupIdInput && !startupNameInput) {
    return NextResponse.json({ error: "startup_id or startup_name is required" }, { status: 400 });
  }
  if (!instagramUrl) {
    return NextResponse.json(
      {
        error:
          "Valid Instagram Reel/Post URL is required. You can paste full URL or shorthand like reel/ABC123.",
      },
      { status: 400 }
    );
  }

  let startup:
    | {
        id: string;
        name: string | null;
        status: string | null;
      }
    | null = null;

  if (startupIdInput) {
    const { data, error } = await supabaseAdmin
      .from("startups")
      .select("id,name,status")
      .eq("id", startupIdInput)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }
    startup = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("startups")
      .select("id,name,status")
      .ilike("name", startupNameInput)
      .limit(2);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    if (rows.length > 1) {
      return NextResponse.json(
        { error: "Multiple startups match this name. Select one from dropdown." },
        { status: 409 }
      );
    }
    if (rows.length === 1) {
      startup = rows[0];
    } else {
      const { data: createdStartup, error: createdStartupError } = await supabaseAdmin
        .from("startups")
        .insert({
          founder_id: authContext.userId,
          name: startupNameInput,
          category: "General",
          status: "approved",
        })
        .select("id,name,status")
        .single();

      if (createdStartupError || !createdStartup) {
        return NextResponse.json(
          { error: createdStartupError?.message ?? "Unable to create startup for this embed." },
          { status: 500 }
        );
      }
      startup = createdStartup;
    }
  }

  if (!startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  if (startup.status !== "approved") {
    const { error: startupUpdateError } = await supabaseAdmin
      .from("startups")
      .update({ status: "approved" })
      .eq("id", startup.id);
    if (startupUpdateError) {
      return NextResponse.json({ error: startupUpdateError.message }, { status: 500 });
    }
  }

  const nowIso = new Date().toISOString();
  const insertWithProcessing = {
    startup_id: startup.id,
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
    startup_id: startup.id,
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
