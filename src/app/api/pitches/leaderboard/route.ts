import { NextResponse } from "next/server";
import { applyNoStoreCache } from "@/lib/http/cache";
import {
  PITCH_OPEN_EVENT_TYPE,
  ROUNDTABLE_VIDEO_OPEN_TOPIC_PREFIX,
  ROUNDTABLE_VIDEO_RAIL_SOURCE,
  type VideoLeaderboardEntry,
  type VideoLeaderboardResponse,
} from "@/lib/pitches/leaderboard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isExternalMediaUrl } from "@/lib/video/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PITCH_PAGE_SIZE = 200;
const ANALYTICS_PAGE_SIZE = 1000;

type PitchRow = {
  id: string;
  startup_id: string | null;
  approved_at: string | null;
  created_at: string;
  poster_path: string | null;
  startup: Array<{
    id: string | null;
    name: string | null;
    one_liner: string | null;
    founder_photo_url: string | null;
    status: string | null;
  }> | null;
};

const parseLimit = (value: string | null) => {
  const parsed = Number(value ?? "10");
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(Math.floor(parsed), 1), 25);
};

const buildFallbackPoster = (index: number) => `/pitches/pitch-0${(index % 4) + 1}.svg?v=2`;

const isMissingAnalyticsTable = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("public.analytics");

const isMissingRoundtableTopicsTable = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("public.roundtable_topics");

const fetchApprovedPitches = async () => {
  const rows: PitchRow[] = [];

  for (let from = 0; ; from += PITCH_PAGE_SIZE) {
    const to = from + PITCH_PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("pitches")
      .select(
        `
          id,
          startup_id,
          approved_at,
          created_at,
          poster_path,
          startup:startup_id (
            id,
            name,
            one_liner,
            founder_photo_url,
            status
          )
        `
      )
      .eq("status", "approved")
      .eq("type", "elevator")
      .order("approved_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const nextRows = ((data ?? []) as PitchRow[]).filter((row) => {
      const startup = Array.isArray(row.startup) ? (row.startup[0] ?? null) : row.startup;
      return Boolean(startup && startup.status === "approved");
    });
    rows.push(...nextRows);

    if ((data ?? []).length < PITCH_PAGE_SIZE) {
      break;
    }
  }

  return rows;
};

const fetchOpenCounts = async () => {
  const counts = new Map<string, number>();

  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    const to = from + ANALYTICS_PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("analytics")
      .select("pitch_id")
      .eq("event_type", PITCH_OPEN_EVENT_TYPE)
      .contains("metadata", { source: ROUNDTABLE_VIDEO_RAIL_SOURCE })
      .not("pitch_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      if (!isMissingAnalyticsTable(error.message)) {
        throw new Error(error.message);
      }
      break;
    }

    const nextRows = (data ?? []) as Array<{ pitch_id: string | null }>;
    for (const row of nextRows) {
      if (!row.pitch_id) continue;
      counts.set(row.pitch_id, (counts.get(row.pitch_id) ?? 0) + 1);
    }

    if (nextRows.length < ANALYTICS_PAGE_SIZE) {
      break;
    }
  }

  for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
    const to = from + ANALYTICS_PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("roundtable_topics")
      .select("title")
      .like("title", `${ROUNDTABLE_VIDEO_OPEN_TOPIC_PREFIX}%`)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      if (!isMissingRoundtableTopicsTable(error.message)) {
        throw new Error(error.message);
      }
      break;
    }

    const nextRows = (data ?? []) as Array<{ title: string | null }>;
    for (const row of nextRows) {
      if (!row.title?.startsWith(ROUNDTABLE_VIDEO_OPEN_TOPIC_PREFIX)) continue;
      const pitchId = row.title.slice(ROUNDTABLE_VIDEO_OPEN_TOPIC_PREFIX.length).trim();
      if (!pitchId) continue;
      counts.set(pitchId, (counts.get(pitchId) ?? 0) + 1);
    }

    if (nextRows.length < ANALYTICS_PAGE_SIZE) {
      break;
    }
  }

  return counts;
};

const resolvePosterUrl = async (posterPath: string | null, founderPhotoUrl: string | null, index: number) => {
  if (posterPath) {
    if (isExternalMediaUrl(posterPath)) {
      return posterPath;
    }

    const { data } = await supabaseAdmin.storage
      .from("pitch-posters")
      .createSignedUrl(posterPath, 60 * 60);

    if (data?.signedUrl) {
      return data.signedUrl;
    }
  }

  return founderPhotoUrl ?? buildFallbackPoster(index);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const [pitchRows, openCounts] = await Promise.all([fetchApprovedPitches(), fetchOpenCounts()]);

    const ranked = pitchRows
      .map((row) => {
        const startup = Array.isArray(row.startup) ? (row.startup[0] ?? null) : row.startup;

        return {
        pitchId: row.id,
        startupId: row.startup_id,
        startupName: startup?.name?.trim() || "Startup",
        tagline: startup?.one_liner?.trim() || null,
        founderPhotoUrl: startup?.founder_photo_url ?? null,
        posterPath: row.poster_path,
        approvedAt: row.approved_at ?? row.created_at,
        createdAt: row.created_at,
        openCount: openCounts.get(row.id) ?? 0,
      };
      })
      .sort((left, right) => {
        if (right.openCount !== left.openCount) return right.openCount - left.openCount;
        if (left.approvedAt !== right.approvedAt) {
          return new Date(right.approvedAt).getTime() - new Date(left.approvedAt).getTime();
        }
        if (left.createdAt !== right.createdAt) {
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        }
        return left.pitchId.localeCompare(right.pitchId);
      });

    const data: VideoLeaderboardEntry[] = await Promise.all(
      ranked.slice(0, limit).map(async (entry, index) => ({
        rank: index + 1,
        pitch_id: entry.pitchId,
        startup_id: entry.startupId,
        startup_name: entry.startupName,
        tagline: entry.tagline,
        poster_url: await resolvePosterUrl(entry.posterPath, entry.founderPhotoUrl, index),
        open_count: entry.openCount,
      }))
    );

    const payload: VideoLeaderboardResponse = {
      window: "all_time",
      metric: "opens",
      data,
    };

    const response = NextResponse.json(payload, { status: 200 });
    applyNoStoreCache(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load video leaderboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
