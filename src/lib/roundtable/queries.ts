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

const pickLatestIso = (current: string | null | undefined, candidate: string | null | undefined) => {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
};

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
  const lastActivityAt = new Map<string, string | null>();
  const queueCountBySession = new Map<string, number>();
  const activeSpeakerBySession = new Map<string, string | null>();
  const joinedDisplayNamesBySession = new Map<string, string[]>();
  if (sessionIds.length) {
    const { data: members, error: membersError } = await supabaseAdmin
      .from("roundtable_members")
      .select("id, session_id, display_name, state, joined_at, left_at")
      .in("session_id", sessionIds)
      .order("joined_at", { ascending: true });

    if (membersError) {
      throw new Error(membersError.message);
    }

    const nameByMemberId = new Map<string, string>();

    for (const row of members ?? []) {
      const member = row as Pick<RoundtableMemberRow, "id" | "session_id" | "display_name" | "state" | "joined_at" | "left_at">;
      const sessionId = member.session_id;

      nameByMemberId.set(member.id, member.display_name);
      lastActivityAt.set(sessionId, pickLatestIso(lastActivityAt.get(sessionId), member.joined_at));
      lastActivityAt.set(sessionId, pickLatestIso(lastActivityAt.get(sessionId), member.left_at));

      if (member.state === "joined") {
        seatsTaken.set(sessionId, (seatsTaken.get(sessionId) ?? 0) + 1);
        joinedDisplayNamesBySession.set(sessionId, [
          ...(joinedDisplayNamesBySession.get(sessionId) ?? []),
          member.display_name,
        ]);
      }
    }

    const { data: turns, error: turnsError } = await supabaseAdmin
      .from("roundtable_turns")
      .select("session_id, member_id, status, created_at, updated_at, submitted_at")
      .in("session_id", sessionIds)
      .order("updated_at", { ascending: false });

    if (turnsError) {
      throw new Error(turnsError.message);
    }

    for (const row of turns ?? []) {
      const turn = row as Pick<
        RoundtableTurnRow,
        "session_id" | "member_id" | "status" | "created_at" | "updated_at" | "submitted_at"
      >;

      lastActivityAt.set(turn.session_id, pickLatestIso(lastActivityAt.get(turn.session_id), turn.updated_at));
      lastActivityAt.set(turn.session_id, pickLatestIso(lastActivityAt.get(turn.session_id), turn.submitted_at));
      lastActivityAt.set(turn.session_id, pickLatestIso(lastActivityAt.get(turn.session_id), turn.created_at));

      if (turn.status === "queued") {
        queueCountBySession.set(turn.session_id, (queueCountBySession.get(turn.session_id) ?? 0) + 1);
      }

      if (turn.status === "active" && !activeSpeakerBySession.has(turn.session_id)) {
        activeSpeakerBySession.set(turn.session_id, nameByMemberId.get(turn.member_id) ?? "Guest");
      }
    }

    const { data: scores, error: scoresError } = await supabaseAdmin
      .from("roundtable_scores")
      .select("session_id, updated_at")
      .in("session_id", sessionIds);

    if (scoresError) {
      throw new Error(scoresError.message);
    }

    for (const row of scores ?? []) {
      const score = row as Pick<RoundtableScoreRow, "session_id" | "updated_at">;
      lastActivityAt.set(score.session_id, pickLatestIso(lastActivityAt.get(score.session_id), score.updated_at));
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
      last_activity_at: pickLatestIso(lastActivityAt.get(session.id), session.updated_at),
      queue_count: queueCountBySession.get(session.id) ?? 0,
      active_speaker_name: activeSpeakerBySession.get(session.id) ?? null,
      joined_display_names: joinedDisplayNamesBySession.get(session.id) ?? [],
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
  const joinedDisplayNames = members
    .filter((member) => member.state === "joined")
    .map((member) => member.display_name);
  let lastActivity = session.updated_at;

  for (const member of members) {
    lastActivity = pickLatestIso(lastActivity, member.joined_at) ?? lastActivity;
    lastActivity = pickLatestIso(lastActivity, member.left_at) ?? lastActivity;
  }

  for (const turn of turns) {
    lastActivity = pickLatestIso(lastActivity, turn.updated_at) ?? lastActivity;
    lastActivity = pickLatestIso(lastActivity, turn.submitted_at) ?? lastActivity;
    lastActivity = pickLatestIso(lastActivity, turn.created_at) ?? lastActivity;
  }

  for (const score of scores) {
    lastActivity = pickLatestIso(lastActivity, score.updated_at) ?? lastActivity;
  }

  return {
    viewer_member_id: null,
    viewer_can_manage_members: false,
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
      last_activity_at: lastActivity,
      queue_count: queue.length,
      active_speaker_name: activeTurn ? nameByMemberId.get(activeTurn.member_id) ?? "Guest" : null,
      joined_display_names: joinedDisplayNames,
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
