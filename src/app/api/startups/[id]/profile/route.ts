import { NextRequest, NextResponse } from "next/server";
import { fetchLiveUsdInrRates, normalizeSupportedCurrency, toDualCurrency } from "@/lib/fx/live-rates";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildMuxPlaybackUrl } from "@/lib/video/mux/server";
import { readAnonWatchId } from "@/lib/watchers/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK_PAGE_SIZE = 100;
const RANK_MAX_PAGES = 80;
const RANK_FALLBACK_CHUNK_SIZE = 300;

type StartupRow = {
  id: string;
  founder_id: string;
  name: string;
  category: string | null;
  city: string | null;
  one_liner: string | null;
  website: string | null;
  founder_photo_url: string | null;
  founder_story: string | null;
  monthly_revenue: string | null;
  social_links: Record<string, string | null> | null;
  is_d2c: boolean;
  status: "pending" | "approved" | "rejected";
  founded_on: string | null;
  country_code: string | null;
  is_for_sale: boolean;
  asking_price: number | string | null;
  currency_code: string | null;
  self_reported_all_time_revenue: number | string | null;
  self_reported_mrr: number | string | null;
  self_reported_active_subscriptions: number | string | null;
  created_at: string;
};

type RevenueConnectionRow = {
  provider: "stripe" | "razorpay";
  status: "active" | "error" | "revoked";
  last_synced_at: string | null;
};

type RevenueSnapshotRow = {
  provider: "stripe" | "razorpay";
  period_start: string;
  gross_revenue: number | string | null;
  currency: string | null;
  mrr: number | string | null;
  active_subscriptions: number | string | null;
  synced_at: string | null;
};

type RankingRow = {
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

type ApprovedPitchRow = {
  id: string;
  ask: string | null;
  equity: string | null;
  valuation: string | null;
  approved_at: string | null;
  created_at: string;
  video_path: string | null;
  poster_path: string | null;
  video_processing_status?: string | null;
  video_mux_playback_id?: string | null;
};

type PitchRankRow = {
  id: string;
  startup_id: string;
  approved_at: string | null;
  created_at: string;
};

type PitchStatRow = {
  pitch_id: string;
  in_count: number | null;
  out_count: number | null;
  comment_count: number | null;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asNullableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTimeMs = (value: string | null | undefined) => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isMissingRankingsRpc = (message: string) =>
  message.includes("Could not find the function public.fetch_startup_rankings");

const isMissingRevenueTables = (message: string | null | undefined) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("revenue_connections") ||
    normalized.includes("revenue_snapshots")
  );
};

const isMissingVideoColumns = (message: string | null | undefined) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("video_processing_status") ||
    normalized.includes("video_mux_playback_id")
  );
};

const resolveAllTimeRankViaRpc = async (startupId: string) => {
  for (let page = 0; page < RANK_MAX_PAGES; page += 1) {
    const offset = page * RANK_PAGE_SIZE;
    const { data, error } = await supabaseAdmin.rpc("fetch_startup_rankings", {
      p_window: "all",
      p_limit: RANK_PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      if (isMissingRankingsRpc(error.message)) {
        return null;
      }
      throw new Error(error.message);
    }

    const rows = (data ?? []) as RankingRow[];
    if (!rows.length) {
      return { rank: null as number | null, total: 0 };
    }

    const match = rows.find((row) => row.startup_id === startupId);
    if (match) {
      return {
        rank: Number(match.rank ?? 0) || null,
        total: Number(match.total_count ?? 0) || 0,
      };
    }

    if (rows.length < RANK_PAGE_SIZE) {
      return {
        rank: null as number | null,
        total: Number(rows[0]?.total_count ?? rows.length) || rows.length,
      };
    }
  }

  return { rank: null as number | null, total: 0 };
};

const resolveAllTimeRankFallback = async (startupId: string) => {
  const { data: startupRows, error: startupError } = await supabaseAdmin
    .from("startups")
    .select("id,name,category")
    .eq("status", "approved");

  if (startupError) {
    throw new Error(startupError.message);
  }

  const startupMap = new Map<string, { id: string; name: string }>();
  for (const row of (startupRows ?? []) as Array<{ id: string; name: string }>) {
    if (!row?.id || !row?.name) continue;
    startupMap.set(row.id, row);
  }

  if (!startupMap.size) return { rank: null as number | null, total: 0 };

  const { data: pitchRows, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .select("id,startup_id,approved_at,created_at")
    .eq("status", "approved")
    .not("video_path", "is", null);

  if (pitchError) {
    throw new Error(pitchError.message);
  }

  const pitchIds: string[] = [];
  const pitchToStartup = new Map<string, string>();
  const latestByStartup = new Map<string, number>();

  for (const pitch of (pitchRows ?? []) as PitchRankRow[]) {
    if (!startupMap.has(pitch.startup_id)) continue;
    pitchIds.push(pitch.id);
    pitchToStartup.set(pitch.id, pitch.startup_id);
    const latestMs = Math.max(parseTimeMs(pitch.created_at), parseTimeMs(pitch.approved_at));
    const existing = latestByStartup.get(pitch.startup_id) ?? 0;
    latestByStartup.set(pitch.startup_id, Math.max(existing, latestMs));
  }

  if (!pitchIds.length) return { rank: null as number | null, total: 0 };

  const startupIdsWithPitch = new Set<string>(pitchToStartup.values());

  const aggregates = new Map<
    string,
    {
      startup_id: string;
      startup_name: string;
      upvotes: number;
      downvotes: number;
      comments: number;
      score: number;
      latest_pitch_at_ms: number;
    }
  >();

  for (const [id, startup] of startupMap.entries()) {
    if (!startupIdsWithPitch.has(id)) continue;
    aggregates.set(id, {
      startup_id: id,
      startup_name: startup.name,
      upvotes: 0,
      downvotes: 0,
      comments: 0,
      score: 0,
      latest_pitch_at_ms: latestByStartup.get(id) ?? 0,
    });
  }

  for (let index = 0; index < pitchIds.length; index += RANK_FALLBACK_CHUNK_SIZE) {
    const chunk = pitchIds.slice(index, index + RANK_FALLBACK_CHUNK_SIZE);
    const { data: statRows, error: statError } = await supabaseAdmin
      .from("pitch_stats")
      .select("pitch_id,in_count,out_count,comment_count")
      .in("pitch_id", chunk);

    if (statError) {
      throw new Error(statError.message);
    }

    for (const stat of (statRows ?? []) as PitchStatRow[]) {
      const startupId = pitchToStartup.get(stat.pitch_id);
      if (!startupId) continue;
      const aggregate = aggregates.get(startupId);
      if (!aggregate) continue;
      aggregate.upvotes += asNumber(stat.in_count);
      aggregate.downvotes += asNumber(stat.out_count);
      aggregate.comments += asNumber(stat.comment_count);
    }
  }

  const ranked = Array.from(aggregates.values())
    .map((row) => {
      const score = row.upvotes * 2 - row.downvotes + row.comments * 1.5;
      return { ...row, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.upvotes !== left.upvotes) return right.upvotes - left.upvotes;
      if (right.comments !== left.comments) return right.comments - left.comments;
      if (right.latest_pitch_at_ms !== left.latest_pitch_at_ms) {
        return right.latest_pitch_at_ms - left.latest_pitch_at_ms;
      }
      return left.startup_name.localeCompare(right.startup_name);
    });

  const index = ranked.findIndex((row) => row.startup_id === startupId);
  return {
    rank: index >= 0 ? index + 1 : null,
    total: ranked.length,
  };
};

const resolveAllTimeRank = async (startupId: string) => {
  const rpcRank = await resolveAllTimeRankViaRpc(startupId);
  if (rpcRank) return rpcRank;
  return resolveAllTimeRankFallback(startupId);
};

const getWatchCount = async (startupId: string) => {
  const { count } = await supabaseAdmin
    .from("startup_watchers")
    .select("id", { count: "exact", head: true })
    .eq("startup_id", startupId);
  return count ?? 0;
};

const resolveWatchingState = async (
  startupId: string,
  profileId: string | null,
  anonId: string | null
) => {
  if (profileId) {
    const { data } = await supabaseAdmin
      .from("startup_watchers")
      .select("id")
      .eq("startup_id", startupId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (data) return true;
  }

  if (anonId) {
    const { data } = await supabaseAdmin
      .from("startup_watchers")
      .select("id")
      .eq("startup_id", startupId)
      .eq("anon_id", anonId)
      .maybeSingle();
    if (data) return true;
  }

  return false;
};

const resolveLatestApprovedPitch = async (startupId: string) => {
  const { data: pitchRow, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .select(
      "id,ask,equity,valuation,approved_at,created_at,video_path,poster_path,video_processing_status,video_mux_playback_id"
    )
    .eq("startup_id", startupId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (pitchError) {
    if (!isMissingVideoColumns(pitchError.message)) {
      throw new Error(pitchError.message);
    }

    const { data: fallbackPitchRow, error: fallbackPitchError } = await supabaseAdmin
      .from("pitches")
      .select("id,ask,equity,valuation,approved_at,created_at,video_path,poster_path")
      .eq("startup_id", startupId)
      .eq("status", "approved")
      .order("approved_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (fallbackPitchError) {
      throw new Error(fallbackPitchError.message);
    }

    if (!fallbackPitchRow) return null;

    const fallbackVideo = fallbackPitchRow.video_path
      ? await supabaseAdmin.storage
          .from("pitch-videos")
          .createSignedUrl(fallbackPitchRow.video_path, 60 * 60)
      : null;
    const fallbackPoster = fallbackPitchRow.poster_path
      ? await supabaseAdmin.storage
          .from("pitch-posters")
          .createSignedUrl(fallbackPitchRow.poster_path, 60 * 60)
      : null;

    return {
      ...fallbackPitchRow,
      video_url: fallbackVideo?.data?.signedUrl ?? null,
      poster_url: fallbackPoster?.data?.signedUrl ?? null,
    };
  }

  if (!pitchRow) return null;

  let videoUrl: string | null = null;
  const muxPlaybackUrl = buildMuxPlaybackUrl(pitchRow.video_mux_playback_id ?? null);
  if (pitchRow.video_processing_status === "ready" && muxPlaybackUrl) {
    videoUrl = muxPlaybackUrl;
  } else if (pitchRow.video_path) {
    const { data: signedVideo } = await supabaseAdmin.storage
      .from("pitch-videos")
      .createSignedUrl(pitchRow.video_path, 60 * 60);
    videoUrl = signedVideo?.signedUrl ?? null;
  }

  let posterUrl: string | null = null;
  if (pitchRow.poster_path) {
    const { data: signedPoster } = await supabaseAdmin.storage
      .from("pitch-posters")
      .createSignedUrl(pitchRow.poster_path, 60 * 60);
    posterUrl = signedPoster?.signedUrl ?? null;
  }

  return {
    ...pitchRow,
    video_url: videoUrl,
    poster_url: posterUrl,
  };
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const startupId = params.id;
    if (!startupId) {
      return NextResponse.json({ error: "startup id required" }, { status: 400 });
    }

    const { data: startup, error: startupError } = await supabaseAdmin
      .from("startups")
      .select(
        "id,founder_id,name,category,city,one_liner,website,founder_photo_url,founder_story,monthly_revenue,social_links,is_d2c,status,founded_on,country_code,is_for_sale,asking_price,currency_code,self_reported_all_time_revenue,self_reported_mrr,self_reported_active_subscriptions,created_at"
      )
      .eq("id", startupId)
      .maybeSingle();

    if (startupError) {
      return NextResponse.json({ error: startupError.message }, { status: 500 });
    }
    if (!startup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const startupRow = startup as StartupRow;
    const auth = await getAuthContext(request);
    const canAccessPrivateStartup =
      !!auth && (startupRow.founder_id === auth.userId || requireRole(auth, ["admin"]));

    if (startupRow.status !== "approved" && !canAccessPrivateStartup) {
      return NextResponse.json({ error: "Startup not found" }, { status: 404 });
    }

    const [{ data: founderRow }, latestPitch, rank, watchersCount, isWatching, fx] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id,display_name,city")
          .eq("id", startupRow.founder_id)
          .maybeSingle(),
        resolveLatestApprovedPitch(startupId),
        resolveAllTimeRank(startupId),
        getWatchCount(startupId),
        resolveWatchingState(startupId, auth?.userId ?? null, readAnonWatchId(request)),
        fetchLiveUsdInrRates(),
      ]);

    let connection: RevenueConnectionRow | null = null;
    let snapshots: RevenueSnapshotRow[] = [];

    const connectionRes = await supabaseAdmin
      .from("revenue_connections")
      .select("provider,status,last_synced_at")
      .eq("startup_id", startupId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!connectionRes.error) {
      connection = (connectionRes.data ?? null) as RevenueConnectionRow | null;
    } else if (!isMissingRevenueTables(connectionRes.error.message)) {
      return NextResponse.json({ error: connectionRes.error.message }, { status: 500 });
    }

    const snapshotRes = await supabaseAdmin
      .from("revenue_snapshots")
      .select("provider,period_start,gross_revenue,currency,mrr,active_subscriptions,synced_at")
      .eq("startup_id", startupId)
      .order("period_start", { ascending: true })
      .limit(200);

    if (!snapshotRes.error) {
      snapshots = (snapshotRes.data ?? []) as RevenueSnapshotRow[];
    } else if (!isMissingRevenueTables(snapshotRes.error.message)) {
      return NextResponse.json({ error: snapshotRes.error.message }, { status: 500 });
    }

    const preferredSnapshots = connection
      ? snapshots.filter((row) => row.provider === connection?.provider)
      : snapshots;
    const activeSnapshots = preferredSnapshots.length ? preferredSnapshots : snapshots;

    const latestSnapshot = activeSnapshots.length ? activeSnapshots[activeSnapshots.length - 1] : null;
    const verifiedAllTimeRevenue = activeSnapshots.reduce(
      (sum, row) => sum + asNumber(row.gross_revenue),
      0
    );

    const selfReportedAllTime = asNullableNumber(startupRow.self_reported_all_time_revenue);
    const selfReportedMrr = asNullableNumber(startupRow.self_reported_mrr);
    const selfReportedActiveSubscriptions = asNullableNumber(
      startupRow.self_reported_active_subscriptions
    );

    const baseCurrency = normalizeSupportedCurrency(
      latestSnapshot?.currency ?? startupRow.currency_code ?? "INR"
    );

    const allTimeRevenue = activeSnapshots.length ? verifiedAllTimeRevenue : selfReportedAllTime;
    const mrr = asNullableNumber(latestSnapshot?.mrr) ?? selfReportedMrr;
    const activeSubscriptions =
      asNullableNumber(latestSnapshot?.active_subscriptions) ?? selfReportedActiveSubscriptions;

    const hasSelfReported =
      selfReportedAllTime !== null || selfReportedMrr !== null || selfReportedActiveSubscriptions !== null;

    const revenueSource = activeSnapshots.length
      ? "verified"
      : hasSelfReported
        ? "self_reported"
        : "none";

    const askingPrice = asNullableNumber(startupRow.asking_price);
    const askingPriceCurrency = normalizeSupportedCurrency(startupRow.currency_code ?? "INR");

    return NextResponse.json({
      startup: {
        id: startupRow.id,
        founder_id: startupRow.founder_id,
        name: startupRow.name,
        category: startupRow.category,
        city: startupRow.city,
        one_liner: startupRow.one_liner,
        website: startupRow.website,
        founder_photo_url: startupRow.founder_photo_url,
        founder_story: startupRow.founder_story,
        monthly_revenue: startupRow.monthly_revenue,
        social_links:
          startupRow.social_links && typeof startupRow.social_links === "object"
            ? startupRow.social_links
            : null,
        is_d2c: Boolean(startupRow.is_d2c),
        status: startupRow.status,
        founded_on: startupRow.founded_on,
        country_code: startupRow.country_code,
        is_for_sale: Boolean(startupRow.is_for_sale),
        asking_price: askingPrice,
        currency_code: askingPriceCurrency,
        asking_price_dual:
          askingPrice === null ? { inr: null, usd: null } : toDualCurrency(askingPrice, askingPriceCurrency, fx),
        self_reported_all_time_revenue: selfReportedAllTime,
        self_reported_mrr: selfReportedMrr,
        self_reported_active_subscriptions: selfReportedActiveSubscriptions,
      },
      founder: {
        id: founderRow?.id ?? startupRow.founder_id,
        display_name: founderRow?.display_name ?? null,
        city: founderRow?.city ?? startupRow.city,
      },
      rank: {
        all_time: rank.rank,
        total: rank.total,
      },
      watchers: {
        count: watchersCount,
        is_watching: isWatching,
      },
      latest_pitch: latestPitch
        ? {
            id: latestPitch.id,
            ask: latestPitch.ask,
            equity: latestPitch.equity,
            valuation: latestPitch.valuation,
            approved_at: latestPitch.approved_at,
            created_at: latestPitch.created_at,
            video_url: latestPitch.video_url,
            poster_url: latestPitch.poster_url,
          }
        : null,
      revenue: {
        source: revenueSource,
        provider: connection?.provider ?? null,
        status: connection?.status ?? "missing",
        last_updated: connection?.last_synced_at ?? latestSnapshot?.synced_at ?? null,
        base_currency: baseCurrency,
        all_time_revenue: allTimeRevenue,
        mrr,
        active_subscriptions: activeSubscriptions,
        all_time_revenue_dual:
          allTimeRevenue === null ? { inr: null, usd: null } : toDualCurrency(allTimeRevenue, baseCurrency, fx),
        mrr_dual: mrr === null ? { inr: null, usd: null } : toDualCurrency(mrr, baseCurrency, fx),
        series: activeSnapshots.map((row) => {
          const amount = asNumber(row.gross_revenue);
          const currency = normalizeSupportedCurrency(row.currency ?? baseCurrency);
          const dual = toDualCurrency(amount, currency, fx);
          return {
            date: row.period_start,
            amount,
            currency,
            inr: dual.inr,
            usd: dual.usd,
          };
        }),
      },
      fx,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load startup profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
