import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type ApprovalRow = {
  id: string;
  approved_at: string | null;
  startups: {
    name: string | null;
  } | null;
};

const parseLimit = (raw: string | null) => {
  const value = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value), 1), MAX_LIMIT);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const after = (searchParams.get("after") ?? "").trim();
  const limit = parseLimit(searchParams.get("limit"));

  let query = supabaseAdmin
    .from("pitches")
    .select("id,approved_at,startups!inner(name)")
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (after) {
    query = query.gt("approved_at", after);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as unknown as ApprovalRow[])
    .filter((row) => Boolean(row.approved_at))
    .map((row) => ({
      id: row.id,
      startup_name: row.startups?.name ?? "Startup",
      approved_at: row.approved_at as string,
    }));

  return NextResponse.json({
    items,
    server_time: new Date().toISOString(),
  });
}
