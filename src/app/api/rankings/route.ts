import { NextResponse } from "next/server";
import { applyPublicEdgeCache } from "@/lib/http/cache";
import { loadPitchVoteStatsMap } from "@/lib/pitches/stats";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_WINDOWS = new Set(["24h", "7d", "30d", "all"]);
const DEFAULT_WINDOW = "7d";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const FALLBACK_CHUNK_SIZE = 250;

type RankingApiRow = {
  rank: number;
  startup_id: string;
  startup_name: string;
  category: string | null;
  upvotes: number;
  downvotes: number;
  comments: number;
  score: number;
  total_count: number;
  company: string;
  sector: string | null;
  cts_score: number;
  revenue: null;
  delta: null;
  updated_at: null;
};

type StartupRow = {
  id: string;
  name: string;
  category: string | null;
};

type PitchRow = {
  id: string;
  startup_id: string;
  approved_at: string | null;
  created_at: string;
};

type FallbackStartupAggregate = {
  startup_id: string;
  startup_name: string;
  category: string | null;
  upvotes: number;
  downvotes: number;
  comments: number;
  score: number;
  latest_pitch_at_ms: number;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundToTwo = (value: number) => Math.round(value * 100) / 100;

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getWindowStartIso = (window: string) => {
  const now = Date.now();
  if (window === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (window === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (window === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
};

const parseTimeMs = (value: string | null | undefined) => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const mapApiRow = (
  row: {
    rank: number;
    startup_id: string;
    startup_name: string;
    category: string | null;
    upvotes: number;
    downvotes: number;
    comments: number;
    score: number;
    total_count: number;
  }
): RankingApiRow => ({
  rank: row.rank,
  startup_id: row.startup_id,
  startup_name: row.startup_name,
  category: row.category,
  upvotes: row.upvotes,
  downvotes: row.downvotes,
  comments: row.comments,
  score: row.score,
  total_count: row.total_count,
  company: row.startup_name,
  sector: row.category,
  cts_score: row.score,
  revenue: null,
  delta: null,
  updated_at: null,
});

const loadFallbackRankings = async (window: string, limit: number, offset: number) => {
  const { data: startups, error: startupsError } = await supabaseAdmin
    .from("startups")
    .select("id,name,category")
    .eq("status", "approved");

  if (startupsError) throw new Error(startupsError.message);

  const startupMap = new Map<string, StartupRow>();
  for (const startup of (startups ?? []) as StartupRow[]) {
    if (!startup?.id || !startup?.name) continue;
    startupMap.set(startup.id, startup);
  }

  if (!startupMap.size) {
    return { rows: [] as RankingApiRow[], total: 0 };
  }

  const { data: pitches, error: pitchesError } = await supabaseAdmin
    .from("pitches")
    .select("id,startup_id,approved_at,created_at")
    .eq("status", "approved")
    .not("video_path", "is", null);

  if (pitchesError) throw new Error(pitchesError.message);

  const pitchToStartup = new Map<string, string>();
  const startupAggregates = new Map<string, FallbackStartupAggregate>();

  for (const pitch of (pitches ?? []) as PitchRow[]) {
    const startup = startupMap.get(pitch.startup_id);
    if (!startup) continue;
    if (!pitch?.id) continue;

    pitchToStartup.set(pitch.id, pitch.startup_id);

    const latestPitchAtMs = Math.max(
      parseTimeMs(pitch.created_at),
      parseTimeMs(pitch.approved_at)
    );

    const existing = startupAggregates.get(pitch.startup_id);
    if (existing) {
      existing.latest_pitch_at_ms = Math.max(existing.latest_pitch_at_ms, latestPitchAtMs);
      continue;
    }

    startupAggregates.set(pitch.startup_id, {
      startup_id: pitch.startup_id,
      startup_name: startup.name,
      category: startup.category,
      upvotes: 0,
      downvotes: 0,
      comments: 0,
      score: 0,
      latest_pitch_at_ms: latestPitchAtMs,
    });
  }

  const pitchIds = Array.from(pitchToStartup.keys());
  if (!pitchIds.length) {
    return { rows: [] as RankingApiRow[], total: 0 };
  }

  const startsAtIso = getWindowStartIso(window);
  const pitchIdChunks = chunkArray(pitchIds, FALLBACK_CHUNK_SIZE);

  for (const pitchIdChunk of pitchIdChunks) {
    const pitchStats = await loadPitchVoteStatsMap(pitchIdChunk, { startsAtIso });
    for (const voteStat of pitchStats.values()) {
      const startupId = pitchToStartup.get(voteStat.pitchId);
      if (!startupId) continue;
      const aggregate = startupAggregates.get(startupId);
      if (!aggregate) continue;
      aggregate.upvotes += voteStat.inCount;
      aggregate.downvotes += voteStat.outCount;
    }
  }

  const ranked = Array.from(startupAggregates.values())
    .map((aggregate) => ({
      ...aggregate,
      comments: 0,
      score: roundToTwo(aggregate.upvotes * 2 - aggregate.downvotes),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.upvotes !== left.upvotes) return right.upvotes - left.upvotes;
      if (right.latest_pitch_at_ms !== left.latest_pitch_at_ms) {
        return right.latest_pitch_at_ms - left.latest_pitch_at_ms;
      }
      return left.startup_name.localeCompare(right.startup_name);
    });

  const total = ranked.length;
  const page = ranked.slice(offset, offset + limit);
  const rows = page.map((row, index) =>
    mapApiRow({
      rank: offset + index + 1,
      startup_id: row.startup_id,
      startup_name: row.startup_name,
      category: row.category,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      comments: row.comments,
      score: row.score,
      total_count: total,
    })
  );

  return { rows, total };
};

const parseLimit = (value: string | null) => {
  const raw = Number(value ?? `${DEFAULT_LIMIT}`);
  if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(raw), 1), MAX_LIMIT);
};

const parseOffset = (value: string | null) => {
  const raw = Number(value ?? "0");
  if (!Number.isFinite(raw)) return 0;
  return Math.max(Math.floor(raw), 0);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const requestedWindow = (searchParams.get("window") ?? DEFAULT_WINDOW).trim().toLowerCase();
  const window = VALID_WINDOWS.has(requestedWindow) ? requestedWindow : DEFAULT_WINDOW;
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));

  try {
    const fallback = await loadFallbackRankings(window, limit, offset);
    const response = NextResponse.json({
      window,
      simulated: false,
      limit,
      offset,
      total: fallback.total,
      data: fallback.rows,
      source: "application",
    });
    applyPublicEdgeCache(response, {
      sMaxAgeSeconds: 120,
      staleWhileRevalidateSeconds: 300,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load rankings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
