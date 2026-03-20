import { supabaseAdmin } from "@/lib/supabase/server";

export type PitchVoteStat = {
  pitchId: string;
  inCount: number;
  outCount: number;
  commentCount: number;
  score: number;
};

type VoteType = "in" | "out";

type PitchVoteRow = {
  pitch_id: string;
  vote: VoteType | string;
};

type PitchGuestVoteRow = {
  pitch_id: string;
  guest_key: string;
  vote: VoteType | string;
  created_at: string;
};

type AnalyticsGuestVoteRow = {
  id: number;
  pitch_id: string | null;
  metadata: {
    guest_key?: string;
    vote?: VoteType | string;
  } | null;
  created_at: string;
};

const emptyStat = (pitchId: string): PitchVoteStat => ({
  pitchId,
  inCount: 0,
  outCount: 0,
  commentCount: 0,
  score: 0,
});

const isVoteType = (value: unknown): value is VoteType => value === "in" || value === "out";

const isMissingGuestVotesTableError = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("pitch_guest_votes");

const toTimeMs = (value: string | null | undefined) => {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const applyVote = (stat: PitchVoteStat, vote: VoteType) => {
  if (vote === "in") stat.inCount += 1;
  if (vote === "out") stat.outCount += 1;
};

const finalizeStat = (stat: PitchVoteStat) => ({
  ...stat,
  commentCount: 0,
  score: stat.inCount * 2 - stat.outCount,
});

export const loadPitchVoteStatsMap = async (
  pitchIds: string[],
  options?: {
    startsAtIso?: string | null;
  }
) => {
  const normalizedPitchIds = Array.from(
    new Set(
      pitchIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  const stats = new Map<string, PitchVoteStat>();
  for (const pitchId of normalizedPitchIds) {
    stats.set(pitchId, emptyStat(pitchId));
  }

  if (!normalizedPitchIds.length) {
    return stats;
  }

  let authVotesQuery = supabaseAdmin
    .from("pitch_votes")
    .select("pitch_id,vote")
    .in("pitch_id", normalizedPitchIds);
  if (options?.startsAtIso) {
    authVotesQuery = authVotesQuery.gte("created_at", options.startsAtIso);
  }

  const { data: authVotes, error: authVotesError } = await authVotesQuery;
  if (authVotesError) {
    throw new Error(authVotesError.message);
  }

  for (const row of (authVotes ?? []) as PitchVoteRow[]) {
    if (!isVoteType(row.vote)) continue;
    const stat = stats.get(row.pitch_id);
    if (!stat) continue;
    applyVote(stat, row.vote);
  }

  const latestGuestVotesByPitchAndGuest = new Map<
    string,
    {
      pitchId: string;
      guestKey: string;
      vote: VoteType;
      sortMs: number;
      sortId: number;
    }
  >();

  let guestVotesQuery = supabaseAdmin
    .from("pitch_guest_votes")
    .select("pitch_id,guest_key,vote,created_at")
    .in("pitch_id", normalizedPitchIds);
  if (options?.startsAtIso) {
    guestVotesQuery = guestVotesQuery.gte("created_at", options.startsAtIso);
  }

  const { data: guestVotes, error: guestVotesError } = await guestVotesQuery;
  if (guestVotesError && !isMissingGuestVotesTableError(guestVotesError.message)) {
    throw new Error(guestVotesError.message);
  }

  for (const row of (guestVotes ?? []) as PitchGuestVoteRow[]) {
    if (!row.pitch_id || !row.guest_key || !isVoteType(row.vote)) continue;
    const key = `${row.pitch_id}:${row.guest_key}`;
    const next = {
      pitchId: row.pitch_id,
      guestKey: row.guest_key,
      vote: row.vote,
      sortMs: toTimeMs(row.created_at),
      sortId: 0,
    };
    const existing = latestGuestVotesByPitchAndGuest.get(key);
    if (
      !existing ||
      next.sortMs > existing.sortMs ||
      (next.sortMs === existing.sortMs && next.sortId > existing.sortId)
    ) {
      latestGuestVotesByPitchAndGuest.set(key, next);
    }
  }

  let analyticsVotesQuery = supabaseAdmin
    .from("analytics")
    .select("id,pitch_id,metadata,created_at")
    .eq("event_type", "pitch_guest_vote")
    .in("pitch_id", normalizedPitchIds);
  if (options?.startsAtIso) {
    analyticsVotesQuery = analyticsVotesQuery.gte("created_at", options.startsAtIso);
  }

  const { data: analyticsVotes, error: analyticsVotesError } = await analyticsVotesQuery;
  if (analyticsVotesError) {
    throw new Error(analyticsVotesError.message);
  }

  for (const row of (analyticsVotes ?? []) as AnalyticsGuestVoteRow[]) {
    if (!row.pitch_id) continue;
    const guestKey = row.metadata?.guest_key?.trim();
    const vote = row.metadata?.vote;
    if (!guestKey || !isVoteType(vote)) continue;
    const key = `${row.pitch_id}:${guestKey}`;
    const next = {
      pitchId: row.pitch_id,
      guestKey,
      vote,
      sortMs: toTimeMs(row.created_at),
      sortId: Number(row.id ?? 0),
    };
    const existing = latestGuestVotesByPitchAndGuest.get(key);
    if (
      !existing ||
      next.sortMs > existing.sortMs ||
      (next.sortMs === existing.sortMs && next.sortId > existing.sortId)
    ) {
      latestGuestVotesByPitchAndGuest.set(key, next);
    }
  }

  for (const vote of latestGuestVotesByPitchAndGuest.values()) {
    const stat = stats.get(vote.pitchId);
    if (!stat) continue;
    applyVote(stat, vote.vote);
  }

  for (const [pitchId, stat] of stats.entries()) {
    stats.set(pitchId, finalizeStat(stat));
  }

  return stats;
};

export const loadPitchVoteStat = async (
  pitchId: string,
  options?: {
    startsAtIso?: string | null;
  }
) => {
  const stats = await loadPitchVoteStatsMap([pitchId], options);
  return stats.get(pitchId) ?? emptyStat(pitchId);
};

export const upsertGuestPitchVote = async (params: {
  pitchId: string;
  guestKey: string;
  vote: VoteType;
}) => {
  const createdAt = new Date().toISOString();
  const { error: guestVoteError } = await supabaseAdmin
    .from("pitch_guest_votes")
    .upsert(
      {
        pitch_id: params.pitchId,
        guest_key: params.guestKey,
        vote: params.vote,
        created_at: createdAt,
      },
      {
        onConflict: "pitch_id,guest_key",
      }
    );

  const guestVotesPersisted = !guestVoteError;
  if (guestVoteError && !isMissingGuestVotesTableError(guestVoteError.message)) {
    throw new Error(guestVoteError.message);
  }

  const { error: analyticsError } = await supabaseAdmin.from("analytics").insert({
    pitch_id: params.pitchId,
    user_id: null,
    event_type: "pitch_guest_vote",
    metadata: {
      guest_key: params.guestKey,
      vote: params.vote,
    },
    created_at: createdAt,
  });

  if (!guestVotesPersisted && analyticsError) {
    throw new Error(analyticsError.message);
  }

  if (analyticsError) {
    console.error("guest pitch vote analytics insert failed", analyticsError.message);
  }
};
