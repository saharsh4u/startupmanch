import { db } from "@/lib/db";
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

type RoundtableTopicGuestVoteRow = {
  title: string;
  description: string | null;
  created_by_guest_id: string | null;
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

const isMissingAnalyticsTableError = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("public.analytics");

const isMissingRoundtableTopicsTableError = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("public.roundtable_topics");

const GUEST_VOTE_TOPIC_PREFIX = "__pitch_guest_vote__:";

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

const buildGuestVoteTopicTitle = (pitchId: string) => `${GUEST_VOTE_TOPIC_PREFIX}${pitchId}`;

const readPitchIdFromGuestVoteTopic = (title: string | null | undefined) => {
  const normalized = title?.trim() ?? "";
  if (!normalized.startsWith(GUEST_VOTE_TOPIC_PREFIX)) return null;
  const pitchId = normalized.slice(GUEST_VOTE_TOPIC_PREFIX.length).trim();
  return pitchId || null;
};

let ensuredGuestVotesTable = false;

const ensureGuestVotesTable = async () => {
  if (ensuredGuestVotesTable) return;
  await db.query(`
    create table if not exists public.pitch_guest_votes (
      id uuid primary key default gen_random_uuid(),
      pitch_id uuid not null references public.pitches(id) on delete cascade,
      guest_key text not null,
      vote public.vote_type not null,
      created_at timestamptz not null default now(),
      unique (pitch_id, guest_key)
    );
  `);
  await db.query(`
    create index if not exists pitch_guest_votes_pitch_created_idx
      on public.pitch_guest_votes (pitch_id, created_at desc);
  `);
  ensuredGuestVotesTable = true;
};

const loadGuestVotesViaDatabase = async (pitchIds: string[], startsAtIso?: string | null) => {
  if (!pitchIds.length) return [] as PitchGuestVoteRow[];
  await ensureGuestVotesTable();
  const params = startsAtIso ? [pitchIds, startsAtIso] : [pitchIds];
  const query = startsAtIso
    ? `
        select
          pitch_id::text as pitch_id,
          guest_key,
          vote::text as vote,
          created_at::text as created_at
        from public.pitch_guest_votes
        where pitch_id = any($1::uuid[])
          and created_at >= $2::timestamptz
      `
    : `
        select
          pitch_id::text as pitch_id,
          guest_key,
          vote::text as vote,
          created_at::text as created_at
        from public.pitch_guest_votes
        where pitch_id = any($1::uuid[])
      `;

  const { rows } = await db.query<PitchGuestVoteRow>(query, params);
  return rows ?? [];
};

const loadGuestVotesViaRoundtableTopics = async (pitchIds: string[], startsAtIso?: string | null) => {
  if (!pitchIds.length) return [] as Array<{
    pitchId: string;
    guestKey: string;
    vote: VoteType;
    createdAt: string;
  }>;

  let query = supabaseAdmin
    .from("roundtable_topics")
    .select("title,description,created_by_guest_id,created_at")
    .in(
      "title",
      pitchIds.map(buildGuestVoteTopicTitle)
    );

  if (startsAtIso) {
    query = query.gte("created_at", startsAtIso);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRoundtableTopicsTableError(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as RoundtableTopicGuestVoteRow[])
    .map((row) => {
      const pitchId = readPitchIdFromGuestVoteTopic(row.title);
      const guestKey = row.created_by_guest_id?.trim() ?? "";
      const vote = row.description?.trim();
      if (!pitchId || !guestKey || !isVoteType(vote)) {
        return null;
      }
      return {
        pitchId,
        guestKey,
        vote,
        createdAt: row.created_at,
      };
    })
    .filter(
      (
        value
      ): value is {
        pitchId: string;
        guestKey: string;
        vote: VoteType;
        createdAt: string;
      } => Boolean(value)
    );
};

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

  const resolvedGuestVotes = guestVotesError
    ? await loadGuestVotesViaDatabase(normalizedPitchIds, options?.startsAtIso)
    : ((guestVotes ?? []) as PitchGuestVoteRow[]);

  for (const row of resolvedGuestVotes) {
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
  if (analyticsVotesError && !isMissingAnalyticsTableError(analyticsVotesError.message)) {
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

  const topicFallbackVotes = await loadGuestVotesViaRoundtableTopics(
    normalizedPitchIds,
    options?.startsAtIso
  );
  for (const row of topicFallbackVotes) {
    const key = `${row.pitchId}:${row.guestKey}`;
    const next = {
      pitchId: row.pitchId,
      guestKey: row.guestKey,
      vote: row.vote,
      sortMs: toTimeMs(row.createdAt),
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

  let guestVotesPersisted = !guestVoteError;
  if (guestVoteError && !isMissingGuestVotesTableError(guestVoteError.message)) {
    throw new Error(guestVoteError.message);
  }
  if (guestVoteError) {
    try {
      await ensureGuestVotesTable();
      await db.query(
        `
          insert into public.pitch_guest_votes (pitch_id, guest_key, vote, created_at)
          values ($1::uuid, $2::text, $3::public.vote_type, $4::timestamptz)
          on conflict (pitch_id, guest_key)
          do update set
            vote = excluded.vote,
            created_at = excluded.created_at
        `,
        [params.pitchId, params.guestKey, params.vote, createdAt]
      );
      guestVotesPersisted = true;
    } catch {
      guestVotesPersisted = false;
    }
  }

  if (!guestVotesPersisted) {
    const title = buildGuestVoteTopicTitle(params.pitchId);
    const { data: existingRows, error: existingRowsError } = await supabaseAdmin
      .from("roundtable_topics")
      .select("id")
      .eq("title", title)
      .eq("created_by_guest_id", params.guestKey);

    if (existingRowsError && !isMissingRoundtableTopicsTableError(existingRowsError.message)) {
      throw new Error(existingRowsError.message);
    }

    const existingIds = ((existingRows ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (existingIds.length) {
      const { error: deleteError } = await supabaseAdmin
        .from("roundtable_topics")
        .delete()
        .in("id", existingIds);
      if (deleteError && !isMissingRoundtableTopicsTableError(deleteError.message)) {
        throw new Error(deleteError.message);
      }
    }

    const { error: topicInsertError } = await supabaseAdmin.from("roundtable_topics").insert({
      title,
      description: params.vote,
      created_by_profile_id: null,
      created_by_guest_id: params.guestKey,
    });

    if (topicInsertError) {
      throw new Error(topicInsertError.message);
    }

    guestVotesPersisted = true;
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

  if (analyticsError && !isMissingAnalyticsTableError(analyticsError.message)) {
    console.error("guest pitch vote analytics insert failed", analyticsError.message);
  }
};
