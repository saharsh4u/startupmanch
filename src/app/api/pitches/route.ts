import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { buildMuxPlaybackUrl } from "@/lib/video/mux/server";

export const runtime = "nodejs";

const validTabs = new Set(["trending", "fresh", "food", "fashion", "category"]);
const validModes = new Set(["week", "feed"]);

type PitchFeedItem = {
  pitch_id: string;
  startup_id: string;
  startup_name: string;
  category: string | null;
  city: string | null;
  one_liner: string | null;
  monthly_revenue?: string | null;
  video_path: string | null;
  poster_path: string | null;
  created_at: string;
  approved_at?: string | null;
  in_count: number;
  out_count: number;
  comment_count: number;
  score: number | string | null;
};

type ShuffledPitchRow = {
  id: string;
  startup_id: string;
  created_at: string;
  approved_at: string | null;
  video_path: string | null;
  poster_path: string | null;
  startups: {
    id: string;
    name: string | null;
    category: string | null;
    city: string | null;
    one_liner: string | null;
    monthly_revenue: string | null;
    founder_id: string | null;
    founder_photo_url: string | null;
    founder_story: string | null;
    status: string | null;
  } | null;
};

type PitchVideoStateRow = {
  id: string;
  startup_id: string;
  approved_at: string | null;
  video_processing_status: string | null;
  video_mux_playback_id: string | null;
};

type StartupMetaRow = {
  id: string;
  founder_id: string | null;
  founder_photo_url: string | null;
  founder_story: string | null;
};

type ProfileMetaRow = {
  id: string;
  display_name: string | null;
};

type PitchStatsRow = {
  pitch_id: string;
  in_count: number | null;
  out_count: number | null;
  comment_count: number | null;
};

const SHUFFLE_WINDOW_MS = 5 * 60 * 1000;

const isMissingVideoProcessingColumnError = (message: string | null | undefined) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("video_processing_status") ||
    normalized.includes("video_mux_playback_id")
  );
};

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildShuffleWindow = (now = Date.now()) => {
  const windowId = Math.floor(now / SHUFFLE_WINDOW_MS);
  const nextShuffleAtMs = (windowId + 1) * SHUFFLE_WINDOW_MS;
  return {
    windowId,
    nextShuffleAt: new Date(nextShuffleAtMs).toISOString(),
  };
};

const stableShuffleKey = (windowId: number, pitchId: string) =>
  createHash("sha256").update(`${windowId}:${pitchId}`).digest("hex");

const applyDeterministicShuffle = (
  items: ShuffledPitchRow[],
  windowId: number,
  categoryFilter: string | null
) => {
  const filtered = items.filter((item) => {
    if (!item.startups || item.startups.status !== "approved") return false;
    if (!categoryFilter) return true;
    const category = (item.startups.category ?? "").toLowerCase();
    return category.includes(categoryFilter.toLowerCase());
  });

  return filtered
    .map((item) => ({
      item,
      key: stableShuffleKey(windowId, item.id),
    }))
    .sort((left, right) => {
      if (left.key < right.key) return -1;
      if (left.key > right.key) return 1;
      return left.item.id.localeCompare(right.item.id);
    })
    .map((entry) => entry.item);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = searchParams.get("mode") ?? "feed";
  const tab = searchParams.get("tab") ?? "trending";
  const categoryParam = searchParams.get("category");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const offsetParam = Number(searchParams.get("offset") ?? "0");
  const minVotesParam = Number(searchParams.get("min_votes") ?? "10");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;
  const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;
  const minVotes = Number.isFinite(minVotesParam) ? Math.max(minVotesParam, 0) : 10;

  const category = typeof categoryParam === "string" ? categoryParam.trim().slice(0, 80) : "";
  const categoryFilter = category.length > 0 ? category : null;
  const safeTab = validTabs.has(tab) ? tab : "trending";
  const resolvedTab = safeTab === "category" && !categoryFilter ? "trending" : safeTab;
  const safeMode = validModes.has(modeParam) ? modeParam : "feed";
  const shouldShuffleByWindow =
    safeMode === "feed" &&
    (searchParams.get("shuffle") === "true" || searchParams.get("shuffle") === "1");

  let rows: PitchFeedItem[] = [];
  let shuffleWindow: ReturnType<typeof buildShuffleWindow> | null = null;

  if (shouldShuffleByWindow) {
    shuffleWindow = buildShuffleWindow();
    const { data: baseRows, error: baseError } = await supabaseAdmin
      .from("pitches")
      .select(
        "id,startup_id,created_at,approved_at,video_path,poster_path,startups!inner(id,name,category,city,one_liner,monthly_revenue,founder_id,founder_photo_url,founder_story,status)"
      )
      .eq("status", "approved")
      .eq("type", "elevator");

    if (baseError) {
      return NextResponse.json({ error: baseError.message }, { status: 500 });
    }

    const shuffledRows = applyDeterministicShuffle(
      (baseRows ?? []) as unknown as ShuffledPitchRow[],
      shuffleWindow.windowId,
      categoryFilter
    );
    const paged = shuffledRows.slice(offset, offset + limit);
    const pageIds = paged.map((item) => item.id);

    const statsByPitchId = new Map<string, PitchStatsRow>();
    if (pageIds.length) {
      const { data: statRows, error: statError } = await supabaseAdmin
        .from("pitch_stats")
        .select("pitch_id,in_count,out_count,comment_count")
        .in("pitch_id", pageIds);
      if (statError) {
        return NextResponse.json({ error: statError.message }, { status: 500 });
      }
      for (const stat of (statRows ?? []) as PitchStatsRow[]) {
        statsByPitchId.set(stat.pitch_id, stat);
      }
    }

    rows = paged.map((item) => {
      const stats = statsByPitchId.get(item.id);
      return {
        pitch_id: item.id,
        startup_id: item.startup_id,
        startup_name: item.startups?.name ?? "Startup",
        category: item.startups?.category ?? null,
        city: item.startups?.city ?? null,
        one_liner: item.startups?.one_liner ?? null,
        monthly_revenue: item.startups?.monthly_revenue ?? null,
        video_path: item.video_path,
        poster_path: item.poster_path,
        created_at: item.created_at,
        approved_at: item.approved_at,
        in_count: asNumber(stats?.in_count),
        out_count: asNumber(stats?.out_count),
        comment_count: asNumber(stats?.comment_count),
        score: 0,
      };
    });
  } else {
    const rpcArgs: {
      mode: string;
      tab: string;
      max_items: number;
      offset_items: number;
      min_votes: number;
      category_filter?: string;
    } = {
      mode: safeMode,
      tab: resolvedTab,
      max_items: limit,
      offset_items: offset,
      min_votes: minVotes,
    };

    if (resolvedTab === "category" && categoryFilter) {
      rpcArgs.category_filter = categoryFilter;
    }

    const { data, error } = await supabaseAdmin.rpc("fetch_pitch_feed", rpcArgs);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    rows = (data ?? []) as PitchFeedItem[];
  }
  const pitchIds = rows.map((item) => item.pitch_id);

  const videoStateByPitchId = new Map<string, PitchVideoStateRow>();
  const startupIds = new Set<string>();
  if (pitchIds.length) {
    const { data: videoStateRows, error: videoStateError } = await supabaseAdmin
      .from("pitches")
      .select("id,startup_id,approved_at,video_processing_status,video_mux_playback_id")
      .in("id", pitchIds);

    if (videoStateError) {
      if (!isMissingVideoProcessingColumnError(videoStateError.message)) {
        return NextResponse.json({ error: videoStateError.message }, { status: 500 });
      }
    } else {
      for (const row of (videoStateRows ?? []) as PitchVideoStateRow[]) {
        videoStateByPitchId.set(row.id, row);
        if (row.startup_id) startupIds.add(row.startup_id);
      }
    }
  }

  const startupMetaById = new Map<string, StartupMetaRow>();
  const founderIds = new Set<string>();

  if (startupIds.size) {
    const { data: startupRows, error: startupError } = await supabaseAdmin
      .from("startups")
      .select("id,founder_id,founder_photo_url,founder_story")
      .in("id", Array.from(startupIds));
    if (startupError) {
      return NextResponse.json({ error: startupError.message }, { status: 500 });
    }

    for (const row of (startupRows ?? []) as StartupMetaRow[]) {
      startupMetaById.set(row.id, row);
      if (row.founder_id) founderIds.add(row.founder_id);
    }
  }

  const founderNameById = new Map<string, string | null>();
  if (founderIds.size) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(founderIds));
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    for (const row of (profileRows ?? []) as ProfileMetaRow[]) {
      founderNameById.set(row.id, row.display_name);
    }
  }

  const enriched = await Promise.all(
    rows.map(async (item: PitchFeedItem, index: number) => {
      let video_url: string | null = null;
      let poster_url: string | null = null;

      const videoState = videoStateByPitchId.get(item.pitch_id);
      const startupMeta = startupMetaById.get(item.startup_id);
      const founderName = startupMeta?.founder_id
        ? founderNameById.get(startupMeta.founder_id) ?? null
        : null;
      const muxPlaybackUrl = buildMuxPlaybackUrl(videoState?.video_mux_playback_id);
      if (videoState?.video_processing_status === "ready" && muxPlaybackUrl) {
        video_url = muxPlaybackUrl;
      } else if (item.video_path) {
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
        monthly_revenue: item.monthly_revenue ?? null,
        in_count: asNumber(item.in_count),
        out_count: asNumber(item.out_count),
        comment_count: asNumber(item.comment_count),
        score: asNumber(item.score),
        approved_at: item.approved_at ?? videoState?.approved_at ?? null,
        founder_photo_url: startupMeta?.founder_photo_url ?? null,
        founder_story: startupMeta?.founder_story ?? null,
        founder_name: founderName,
        slot_index: offset + index + 1,
        video_url,
        poster_url,
      };
    })
  );
  const response = NextResponse.json({
    mode: safeMode,
    tab: resolvedTab,
    data: enriched,
    offset,
    limit,
    window_id: shuffleWindow?.windowId ?? null,
    next_shuffle_at: shuffleWindow?.nextShuffleAt ?? null,
  });

  if (shuffleWindow) {
    response.headers.set("Cache-Control", "public, s-maxage=240, stale-while-revalidate=30");
  }

  return response;
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
