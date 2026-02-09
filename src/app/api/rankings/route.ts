import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_WINDOWS = new Set(["24h", "7d", "30d", "all"]);
const DEFAULT_WINDOW = "7d";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

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

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as RankingRpcRow[];
  const mapped: RankingApiRow[] = rows.map((row) => {
    const score = asNumber(row.score);
    const totalCount = asNumber(row.total_count);
    const startupName = row.startup_name ?? "Startup";

    return {
      rank: asNumber(row.rank),
      startup_id: row.startup_id,
      startup_name: startupName,
      category: row.category,
      upvotes: asNumber(row.upvotes),
      downvotes: asNumber(row.downvotes),
      comments: asNumber(row.comments),
      score,
      total_count: totalCount,
      company: startupName,
      sector: row.category,
      cts_score: score,
      revenue: null,
      delta: null,
      updated_at: null,
    };
  });

  const total = mapped[0]?.total_count ?? 0;

  return NextResponse.json({
    window,
    simulated: false,
    limit,
    offset,
    total,
    data: mapped,
  });
}
