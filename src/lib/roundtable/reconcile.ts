import { ROUND_TABLE_PRESENCE } from "@/lib/roundtable/constants";
import {
  deleteRoundtableMembers,
  deleteSessionIfEmpty,
  getReconnectGraceExpiryIso,
  isReconnectGraceActive,
  logRoundtableEvent,
  nowIso,
} from "@/lib/roundtable/server";
import type { RoundtableSessionRow, RoundtableTurnRow } from "@/lib/roundtable/types";
import { supabaseAdmin } from "@/lib/supabase/server";

const INACTIVITY_END_MS = 10 * 60 * 1000;

const toMs = (value: string | null | undefined) => {
  if (!value) return NaN;
  return Date.parse(value);
};

const resolveQueuedHandForMember = async (sessionId: string, memberId: string) => {
  const { data: hand, error: handError } = await supabaseAdmin
    .from("roundtable_raise_hands")
    .select("id")
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .eq("status", "queued")
    .order("queued_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (handError) {
    throw new Error(handError.message);
  }

  if (!hand?.id) return;

  const { error: updateError } = await supabaseAdmin
    .from("roundtable_raise_hands")
    .update({ status: "resolved", resolved_at: nowIso() })
    .eq("id", hand.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
};

const purgeDetachedMembers = async (sessionId: string) => {
  const { data, error } = await supabaseAdmin
    .from("roundtable_members")
    .select("id, state, left_at")
    .eq("session_id", sessionId)
    .in("state", ["left", "kicked"]);

  if (error) {
    throw new Error(error.message);
  }

  const ids = (data ?? [])
    .filter((row) => {
      const state = String(row.state ?? "");
      return state === "kicked" || (state === "left" && !isReconnectGraceActive(String(row.left_at ?? "")));
    })
    .map((row) => String(row.id))
    .filter(Boolean);
  if (ids.length) {
    await deleteRoundtableMembers(ids);
  }
};

const cleanupStaleMembers = async (session: RoundtableSessionRow) => {
  const { data, error } = await supabaseAdmin
    .from("roundtable_members")
    .select("id, joined_at, last_seen_at")
    .eq("session_id", session.id)
    .eq("state", "joined");

  if (error) {
    throw new Error(error.message);
  }

  const joinedRows = (data ?? []) as Array<{ id: string; joined_at: string; last_seen_at: string | null }>;
  if (!joinedRows.length) {
    await deleteSessionIfEmpty(session.id);
    return true;
  }

  const nowMs = Date.now();
  const staleRows = joinedRows.filter((row) => {
    const lastSeenMs = toMs(row.last_seen_at) || toMs(row.joined_at);
    return !Number.isFinite(lastSeenMs) || nowMs - lastSeenMs >= ROUND_TABLE_PRESENCE.staleAfterMs;
  });

  if (staleRows.length) {
    for (const row of staleRows) {
      const lastSeenMs = toMs(row.last_seen_at) || toMs(row.joined_at);
      const disconnectedAtIso = Number.isFinite(lastSeenMs) ? new Date(lastSeenMs).toISOString() : nowIso();
      const { error: updateError } = await supabaseAdmin
        .from("roundtable_members")
        .update({
          state: "left",
          left_at: disconnectedAtIso,
          last_seen_at: disconnectedAtIso,
        })
        .eq("id", row.id)
        .eq("state", "joined");

      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    await logRoundtableEvent("roundtable_stale_members_disconnected", {
      session_id: session.id,
      member_ids: staleRows.map((row) => row.id),
      reconnect_expires_at: staleRows.map((row) => getReconnectGraceExpiryIso(row.last_seen_at ?? row.joined_at, nowMs)),
    });
  }

  return deleteSessionIfEmpty(session.id);
};

const endExpiredActiveTurn = async (turn: RoundtableTurnRow) => {
  const { error } = await supabaseAdmin
    .from("roundtable_turns")
    .update({
      status: "expired",
      auto_submitted: true,
      submitted_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", turn.id)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  await resolveQueuedHandForMember(turn.session_id, turn.member_id);
  await logRoundtableEvent("roundtable_turn_auto_expired", {
    session_id: turn.session_id,
    turn_id: turn.id,
    member_id: turn.member_id,
  });
};

const activateNextTurn = async (session: RoundtableSessionRow) => {
  const { data: members, error: membersError } = await supabaseAdmin
    .from("roundtable_members")
    .select("id")
    .eq("session_id", session.id)
    .eq("state", "joined");

  if (membersError) {
    throw new Error(membersError.message);
  }

  const joinedIds = new Set((members ?? []).map((item) => String(item.id)));
  const { data: queuedTurns, error: turnsError } = await supabaseAdmin
    .from("roundtable_turns")
    .select("id, session_id, member_id, status, body, starts_at, ends_at, submitted_at, auto_submitted, hidden_for_abuse, created_at, updated_at")
    .eq("session_id", session.id)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(10);

  if (turnsError) {
    throw new Error(turnsError.message);
  }

  const next = ((queuedTurns ?? []) as RoundtableTurnRow[]).find((turn) => joinedIds.has(turn.member_id));
  if (!next) return false;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + session.turn_duration_sec * 1000);

  const { error: activateError } = await supabaseAdmin
    .from("roundtable_turns")
    .update({
      status: "active",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      updated_at: nowIso(),
    })
    .eq("id", next.id)
    .eq("status", "queued");

  if (activateError) {
    throw new Error(activateError.message);
  }

  await resolveQueuedHandForMember(session.id, next.member_id);

  const updates: Partial<RoundtableSessionRow> = {
    updated_at: nowIso(),
  };

  if (session.status === "lobby") {
    updates.status = "live";
    updates.started_at = nowIso();
  }

  const { error: sessionUpdateError } = await supabaseAdmin
    .from("roundtable_sessions")
    .update(updates)
    .eq("id", session.id);

  if (sessionUpdateError) {
    throw new Error(sessionUpdateError.message);
  }

  await logRoundtableEvent("roundtable_turn_started", {
    session_id: session.id,
    turn_id: next.id,
    member_id: next.member_id,
  });

  return true;
};

const maybeEndInactiveSession = async (session: RoundtableSessionRow) => {
  if (session.status !== "live") return;
  const updatedAtMs = toMs(session.updated_at);
  if (!Number.isFinite(updatedAtMs)) return;
  if (Date.now() - updatedAtMs < INACTIVITY_END_MS) return;

  const { error } = await supabaseAdmin
    .from("roundtable_sessions")
    .update({
      status: "ended",
      ended_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", session.id)
    .eq("status", "live");

  if (error) {
    throw new Error(error.message);
  }
};

export const reconcileSession = async (sessionId: string) => {
  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .select("id, topic_id, status, max_seats, turn_duration_sec, created_by_profile_id, created_by_guest_id, started_at, ended_at, created_at, updated_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }
  if (!sessionData) return;

  const session = sessionData as RoundtableSessionRow;
  if (session.status === "ended" || session.status === "cancelled") return;

  await purgeDetachedMembers(session.id);
  const deletedAfterCleanup = await cleanupStaleMembers(session);
  if (deletedAfterCleanup) return;

  const { data: activeTurnData, error: activeTurnError } = await supabaseAdmin
    .from("roundtable_turns")
    .select("id, session_id, member_id, status, body, starts_at, ends_at, submitted_at, auto_submitted, hidden_for_abuse, created_at, updated_at")
    .eq("session_id", session.id)
    .eq("status", "active")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (activeTurnError) {
    throw new Error(activeTurnError.message);
  }

  const activeTurn = (activeTurnData ?? null) as RoundtableTurnRow | null;
  const activeEndsAtMs = toMs(activeTurn?.ends_at);

  if (activeTurn && Number.isFinite(activeEndsAtMs) && activeEndsAtMs <= Date.now()) {
    await endExpiredActiveTurn(activeTurn);
  }

  const { data: activeAfterData, error: activeAfterError } = await supabaseAdmin
    .from("roundtable_turns")
    .select("id")
    .eq("session_id", session.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeAfterError) {
    throw new Error(activeAfterError.message);
  }

  if (!activeAfterData) {
    const activated = await activateNextTurn(session);
    if (!activated) {
      await maybeEndInactiveSession(session);
    }
  }
};

export const reconcileOpenSessions = async (limit = 30) => {
  const { data, error } = await supabaseAdmin
    .from("roundtable_sessions")
    .select("id")
    .in("status", ["lobby", "live"])
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    await reconcileSession(String(row.id));
  }
};
