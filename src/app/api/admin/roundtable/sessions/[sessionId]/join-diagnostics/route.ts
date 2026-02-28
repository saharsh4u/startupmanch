import { NextResponse } from "next/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type AnalyticsRow = {
  event_type: string;
  metadata: unknown;
  created_at: string;
};

const parseWindowHours = (value: string | null) => {
  const parsed = Number(value ?? "24");
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(Math.max(Math.floor(parsed), 1), 168);
};

const readMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {} as Record<string, unknown>;
  }
  return metadata as Record<string, unknown>;
};

const asString = (value: unknown) => (typeof value === "string" ? value : null);
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const sortCounts = (map: Map<string, number>) =>
  Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowHours = parseWindowHours(searchParams.get("window"));
  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("analytics")
    .select("event_type, metadata, created_at")
    .in("event_type", ["roundtable_join_attempt", "roundtable_join_success"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as AnalyticsRow[];
  const relevant = rows.filter((row) => {
    const metadata = readMetadata(row.metadata);
    return asString(metadata.session_id) === params.sessionId;
  });

  const attemptRows = relevant.filter((row) => row.event_type === "roundtable_join_attempt");
  const successRows = relevant.filter((row) => row.event_type === "roundtable_join_success");

  const byResultCode = new Map<string, number>();
  const byHttpStatus = new Map<string, number>();
  const byActorType = new Map<string, number>();

  for (const row of attemptRows) {
    const metadata = readMetadata(row.metadata);
    const code = asString(metadata.result_code) ?? "unknown";
    const status = asNumber(metadata.http_status) ?? -1;
    const actorType = asString(metadata.actor_type) ?? "unknown";

    byResultCode.set(code, (byResultCode.get(code) ?? 0) + 1);
    byHttpStatus.set(String(status), (byHttpStatus.get(String(status)) ?? 0) + 1);
    byActorType.set(actorType, (byActorType.get(actorType) ?? 0) + 1);
  }

  return NextResponse.json(
    {
      session_id: params.sessionId,
      window_hours: windowHours,
      since: sinceIso,
      sample_limit: 5000,
      total_events: relevant.length,
      attempts: attemptRows.length,
      successes: successRows.length,
      by_result_code: sortCounts(byResultCode),
      by_http_status: sortCounts(byHttpStatus),
      by_actor_type: sortCounts(byActorType),
    },
    { status: 200 }
  );
}
