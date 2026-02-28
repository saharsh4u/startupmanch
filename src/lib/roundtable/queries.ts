import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  RoundtableLeaderboardEntry,
  RoundtableLobbyResponse,
  RoundtableMemberRow,
  RoundtableScoreRow,
  RoundtableSessionRow,
  RoundtableSessionSnapshot,
  RoundtableSessionSummary,
  RoundtableTopicRow,
  RoundtableTurnRow,
} from "@/lib/roundtable/types";

const withFallbackTags = (tags: string[] | null | undefined) => (Array.isArray(tags) ? tags : []);

export const getWeeklyLeaderboard = async (): Promise<RoundtableLeaderboardEntry[]> => {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("roundtable_sessions")
    .select("id")
    .gte("created_at", sinceIso);

  if (sessionsError) {
    throw new Error(sessionsError.message);
  }

  const sessionIds = (sessions ?? []).map((row) => row.id as string);
  if (!sessionIds.length) return [];

  const { data: scores, error: scoresError } = await supabaseAdmin
    .from("roundtable_scores")
    .select("session_id, member_id, points, approved_turns, upvotes_received, useful_marks, violations, updated_at")
    .in("session_id", sessionIds);

  if (scoresError) {
    throw new Error(scoresError.message);
  }

  const memberIds = Array.from(new Set((scores ?? []).map((score) => score.member_id as string)));
  if (!memberIds.length) return [];

  const { data: members, error: membersError } = await supabaseAdmin
    .from("roundtable_members")
    .select("id, display_name")
    .in("id", memberIds);

  if (membersError) {
    throw new Error(membersError.message);
  }

  const nameByMember = new Map<string, string>();
  for (const member of members ?? []) {
    nameByMember.set(member.id as string, String(member.display_name ?? "Guest"));
  }

  const aggregate = new Map<string, RoundtableLeaderboardEntry>();

  for (const row of (scores ?? []) as RoundtableScoreRow[]) {
    const current = aggregate.get(row.member_id) ?? {
      member_id: row.member_id,
      display_name: nameByMember.get(row.member_id) ?? "Guest",
      points: 0,
      approved_turns: 0,
      upvotes_received: 0,
      useful_marks: 0,
    };

    current.points += Number(row.points ?? 0);
    current.approved_turns += Number(row.approved_turns ?? 0);
    current.upvotes_received += Number(row.upvotes_received ?? 0);
    current.useful_marks += Number(row.useful_marks ?? 0);
    aggregate.set(row.member_id, current);
  }

  return Array.from(aggregate.values())
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
};

export const getLobbyData = async (): Promise<RoundtableLobbyResponse> => {
  const { data, error } = await supabaseAdmin
    .from("roundtable_sessions")
    .select(
      "id, topic_id, status, max_seats, turn_duration_sec, created_by_profile_id, created_by_guest_id, started_at, ended_at, created_at, updated_at, roundtable_topics(id, title, description, tags, created_by_profile_id, created_by_guest_id, created_at)"
    )
    .in("status", ["lobby", "live"])
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    throw new Error(error.message);
  }

  const sessions = (data ?? []) as Array<RoundtableSessionRow & { roundtable_topics: RoundtableTopicRow | RoundtableTopicRow[] | null }>;
  const sessionIds = sessions.map((session) => session.id);

  const seatsTaken = new Map<string, number>();
  if (sessionIds.length) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from("roundtable_members")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("state", "joined");

    if (membersError) {
      throw new Error(membersError.message);
    }

    for (const member of members ?? []) {
      const sessionId = String(member.session_id);
      seatsTaken.set(sessionId, (seatsTaken.get(sessionId) ?? 0) + 1);
    }
  }

  const summaries: RoundtableSessionSummary[] = sessions.map((session) => {
    const topic = Array.isArray(session.roundtable_topics)
      ? session.roundtable_topics[0] ?? null
      : session.roundtable_topics;

    return {
      session_id: session.id,
      topic_id: session.topic_id,
      topic_title: topic?.title ?? "Untitled topic",
      topic_description: topic?.description ?? null,
      tags: withFallbackTags(topic?.tags),
      status: session.status,
      turn_duration_sec: session.turn_duration_sec,
      max_seats: session.max_seats,
      seats_taken: seatsTaken.get(session.id) ?? 0,
      created_at: session.created_at,
    };
  });

  const leaderboard = await getWeeklyLeaderboard();
  return {
    sessions: summaries,
    leaderboard,
  };
};

export const getSessionSnapshot = async (sessionId: string): Promise<RoundtableSessionSnapshot | null> => {
  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .select(
      "id, topic_id, status, max_seats, turn_duration_sec, created_by_profile_id, created_by_guest_id, started_at, ended_at, created_at, updated_at, roundtable_topics(id, title, description, tags, created_by_profile_id, created_by_guest_id, created_at)"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!sessionData) return null;

  const session = sessionData as RoundtableSessionRow & {
    roundtable_topics: RoundtableTopicRow | RoundtableTopicRow[] | null;
  };

  const topic = Array.isArray(session.roundtable_topics)
    ? session.roundtable_topics[0] ?? null
    : session.roundtable_topics;

  const { data: membersData, error: membersError } = await supabaseAdmin
    .from("roundtable_members")
    .select("id, session_id, seat_no, profile_id, guest_id, display_name, state, joined_at, left_at")
    .eq("session_id", sessionId)
    .order("seat_no", { ascending: true });

  if (membersError) {
    throw new Error(membersError.message);
  }

  const members = (membersData ?? []) as RoundtableMemberRow[];
  const nameByMemberId = new Map<string, string>(members.map((member) => [member.id, member.display_name]));

  const { data: turnsData, error: turnsError } = await supabaseAdmin
    .from("roundtable_turns")
    .select("id, session_id, member_id, status, body, starts_at, ends_at, submitted_at, auto_submitted, hidden_for_abuse, created_at, updated_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (turnsError) {
    throw new Error(turnsError.message);
  }

  const turns = (turnsData ?? []) as RoundtableTurnRow[];

  const queue = turns
    .filter((turn) => turn.status === "queued")
    .map((turn) => ({
      ...turn,
      member_display_name: nameByMemberId.get(turn.member_id) ?? "Guest",
    }));

  const activeTurn = turns.find((turn) => turn.status === "active") ?? null;

  const recentTurns = turns
    .filter((turn) => ["submitted", "expired", "skipped"].includes(turn.status))
    .filter((turn) => !turn.hidden_for_abuse)
    .slice(-20)
    .reverse()
    .map((turn) => ({
      ...turn,
      member_display_name: nameByMemberId.get(turn.member_id) ?? "Guest",
    }));

  const { data: scoresData, error: scoresError } = await supabaseAdmin
    .from("roundtable_scores")
    .select("session_id, member_id, points, approved_turns, upvotes_received, useful_marks, violations, updated_at")
    .eq("session_id", sessionId)
    .order("points", { ascending: false });

  if (scoresError) {
    throw new Error(scoresError.message);
  }

  const scores = ((scoresData ?? []) as RoundtableScoreRow[]).map((score) => ({
    ...score,
    member_display_name: nameByMemberId.get(score.member_id) ?? "Guest",
  }));

  const seatsTaken = members.filter((member) => member.state === "joined").length;

  return {
    viewer_member_id: null,
    session: {
      session_id: session.id,
      topic_id: session.topic_id,
      topic_title: topic?.title ?? "Untitled topic",
      topic_description: topic?.description ?? null,
      tags: withFallbackTags(topic?.tags),
      status: session.status,
      turn_duration_sec: session.turn_duration_sec,
      max_seats: session.max_seats,
      seats_taken: seatsTaken,
      created_at: session.created_at,
    },
    topic: {
      id: topic?.id ?? session.topic_id,
      title: topic?.title ?? "Untitled topic",
      description: topic?.description ?? null,
      tags: withFallbackTags(topic?.tags),
    },
    members,
    queue,
    active_turn: activeTurn
      ? {
          ...activeTurn,
          member_display_name: nameByMemberId.get(activeTurn.member_id) ?? "Guest",
        }
      : null,
    recent_turns: recentTurns,
    scores,
  };
};
