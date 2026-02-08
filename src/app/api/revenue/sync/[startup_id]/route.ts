import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

const days = 90;

const generateStubSeries = () => {
  const today = new Date();
  const entries: { period_start: string; period_end: string; gross_revenue: number; currency: string; mrr: number; active_subscriptions: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    entries.push({
      period_start: d.toISOString().slice(0, 10),
      period_end: d.toISOString().slice(0, 10),
      gross_revenue: 0,
      currency: "usd",
      mrr: 0,
      active_subscriptions: 0,
    });
  }
  return entries;
};

export async function POST(request: Request, { params }: { params: { startup_id: string } }) {
  try {
    const auth = await getAuthContext(request);
    if (!auth || !requireRole(auth, ["founder", "admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const startup_id = params.startup_id;
    const { data: startupRow } = await supabaseAdmin
      .from("startups")
      .select("founder_id")
      .eq("id", startup_id)
      .single();
    if (!startupRow) return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    if (startupRow.founder_id !== auth.userId && !requireRole(auth, ["admin"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // TODO: Replace stub with real provider pull.
    const stub = generateStubSeries();
    const rows = stub.map((item) => ({
      startup_id,
      provider: "stripe" as const,
      period_start: item.period_start,
      period_end: item.period_end,
      currency: item.currency,
      gross_revenue: item.gross_revenue,
      net_revenue: item.gross_revenue,
      mrr: item.mrr,
      active_subscriptions: item.active_subscriptions,
    }));

    const { error: upsertError } = await supabaseAdmin.from("revenue_snapshots").upsert(rows, {
      onConflict: "startup_id,provider,period_start",
    });
    if (upsertError) throw upsertError;

    const { error: updateError } = await supabaseAdmin
      .from("revenue_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("startup_id", startup_id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (err: any) {
    console.error("revenue sync error", err);
    return NextResponse.json({ error: err.message ?? "Unable to sync revenue" }, { status: 500 });
  }
}
