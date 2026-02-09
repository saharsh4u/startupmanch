import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_WINDOWS = new Set(["24h", "7d", "30d", "all"]);
const DEFAULT_WINDOW = "7d";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const FALLBACK_CHUNK_SIZE = 250;

type RankingRpcRow = {
  rank: number | null;
  startup_id: string;
  startup_name: string;
  category: string | null;
  upvotes: number | null;
  downvotes: number | null;
  comments: number | null;
  score: number | string | null;
  total_count: number | null;
};

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

type VoteRow = {
  pitch_id: string;
  vote: "in" | "out" | string;
};

type CommentRow = {
  pitch_id: string;
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

const isMissingRankingsRpc = (message: string) =>
  message.includes("Could not find the function public.fetch_startup_rankings");

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
    let votesQuery = supabaseAdmin
      .from("pitch_votes")
      .select("pitch_id,vote")
      .in("pitch_id", pitchIdChunk);
    if (startsAtIso) {
      votesQuery = votesQuery.gte("created_at", startsAtIso);
    }

    const { data: votes, error: votesError } = await votesQuery;
    if (votesError) throw new Error(votesError.message);

    for (const vote of (votes ?? []) as VoteRow[]) {
      const startupId = pitchToStartup.get(vote.pitch_id);
      if (!startupId) continue;
      const aggregate = startupAggregates.get(startupId);
      if (!aggregate) continue;
      if (vote.vote === "in") aggregate.upvotes += 1;
      if (vote.vote === "out") aggregate.downvotes += 1;
    }

    let commentsQuery = supabaseAdmin
      .from("pitch_comments")
      .select("pitch_id")
      .in("pitch_id", pitchIdChunk);
    if (startsAtIso) {
      commentsQuery = commentsQuery.gte("created_at", startsAtIso);
    }

    const { data: comments, error: commentsError } = await commentsQuery;
    if (commentsError) throw new Error(commentsError.message);

    for (const comment of (comments ?? []) as CommentRow[]) {
      const startupId = pitchToStartup.get(comment.pitch_id);
      if (!startupId) continue;
      const aggregate = startupAggregates.get(startupId);
      if (!aggregate) continue;
      aggregate.comments += 1;
    }
  }

  const ranked = Array.from(startupAggregates.values())
    .map((aggregate) => ({
      ...aggregate,
      score: roundToTwo(
        aggregate.upvotes * 2 - aggregate.downvotes + aggregate.comments * 1.5
      ),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.upvotes !== left.upvotes) return right.upvotes - left.upvotes;
      if (right.comments !== left.comments) return right.comments - left.comments;
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

  const { data, error } = await supabaseAdmin.rpc("fetch_startup_rankings", {
    p_window: window,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    if (isMissingRankingsRpc(error.message)) {
      try {
        const fallback = await loadFallbackRankings(window, limit, offset);
        return NextResponse.json({
          window,
          simulated: false,
          limit,
          offset,
          total: fallback.total,
          data: fallback.rows,
          source: "fallback",
        });
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Unable to load rankings.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as RankingRpcRow[];
  const mapped: RankingApiRow[] = rows.map((row) => {
    const score = asNumber(row.score);
    const totalCount = asNumber(row.total_count);
    const startupName = row.startup_name ?? "Startup";
    return mapApiRow({
      rank: asNumber(row.rank),
      startup_id: row.startup_id,
      startup_name: startupName,
      category: row.category,
      upvotes: asNumber(row.upvotes),
      downvotes: asNumber(row.downvotes),
      comments: asNumber(row.comments),
      score,
      total_count: totalCount,
    });
  });

  const total = mapped[0]?.total_count ?? 0;

  return NextResponse.json({
    window,
    simulated: false,
    limit,
    offset,
    total,
    data: mapped,
    source: "rpc",
  });
}
