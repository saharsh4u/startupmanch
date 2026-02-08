import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Provider = "stripe" | "razorpay";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const pitchId = params.id;
    if (!pitchId) return NextResponse.json({ error: "Pitch id required" }, { status: 400 });

    const { data: pitchRow, error: pitchError } = await supabaseAdmin
      .from("pitches")
      .select("id, startup_id")
      .eq("id", pitchId)
      .single();
    if (pitchError || !pitchRow) return NextResponse.json({ error: "Pitch not found" }, { status: 404 });

    const startupId = pitchRow.startup_id;

    const { data: connection } = await supabaseAdmin
      .from("revenue_connections")
      .select("id, provider, status, last_synced_at")
      .eq("startup_id", startupId)
      .maybeSingle();

    const { data: snapshots } = await supabaseAdmin
      .from("revenue_snapshots")
      .select("period_start, gross_revenue, currency, mrr, active_subscriptions, synced_at, provider")
      .eq("startup_id", startupId)
      .order("period_start", { ascending: true })
      .limit(120);

    const series = (snapshots ?? []).map((row) => ({
      date: row.period_start,
      amount: Number(row.gross_revenue ?? 0),
      currency: row.currency ?? "usd",
    }));

    const last = snapshots?.[snapshots.length - 1];
    const allTime = (snapshots ?? []).reduce((sum, row) => sum + Number(row.gross_revenue ?? 0), 0);

    const payload = {
      provider: (connection?.provider ?? null) as Provider | null,
      status: (connection?.status ?? "missing") as "active" | "error" | "revoked" | "missing",
      last_updated: connection?.last_synced_at ?? last?.synced_at ?? null,
      metrics: {
        all_time_revenue: allTime,
        mrr: last?.mrr ?? null,
        active_subscriptions: last?.active_subscriptions ?? null,
      },
      currency: last?.currency ?? "usd",
      series,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("revenue fetch error", err);
    return NextResponse.json({ error: err.message ?? "Unable to fetch revenue" }, { status: 500 });
  }
}
