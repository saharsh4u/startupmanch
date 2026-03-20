import type { RoundtableActor, RoundtableSessionVisibility } from "@/lib/roundtable/types";
import { deleteRoundtableMembers, deleteSessionIfEmpty, isReconnectGraceActive } from "@/lib/roundtable/server";
import { applyVisibilityTag } from "@/lib/roundtable/visibility";
import { supabaseAdmin } from "@/lib/supabase/server";

export const createRoundtableSession = async (params: {
  actor: RoundtableActor;
  title: string;
  description?: string | null;
  tags?: string[];
  turnDurationSec: number;
  visibility: RoundtableSessionVisibility;
}) => {
  if (params.actor.profileId || params.actor.guestId) {
    let priorMembershipQuery = supabaseAdmin
      .from("roundtable_members")
      .select("id, session_id, state, left_at")
      .in("state", ["joined", "left"]);

    if (params.actor.profileId) {
      priorMembershipQuery = priorMembershipQuery.eq("profile_id", params.actor.profileId);
    } else if (params.actor.guestId) {
      priorMembershipQuery = priorMembershipQuery.eq("guest_id", params.actor.guestId);
    }

    const { data: priorMemberships, error: priorMembershipError } = await priorMembershipQuery;
    if (priorMembershipError) {
      throw new Error(priorMembershipError.message);
    }

    const rows = (priorMemberships ?? [])
      .filter((row) => {
        const state = String(row.state ?? "");
        return state === "joined" || (state === "left" && isReconnectGraceActive(String(row.left_at ?? "")));
      })
      .map((row) => ({
        id: String(row.id),
        sessionId: String(row.session_id),
      }));
    if (rows.length) {
      await deleteRoundtableMembers(rows.map((row) => row.id));
      for (const staleSessionId of Array.from(new Set(rows.map((row) => row.sessionId)))) {
        await deleteSessionIfEmpty(staleSessionId);
      }
    }
  }

  const tags = applyVisibilityTag(params.tags, params.visibility);

  const { data: topic, error: topicError } = await supabaseAdmin
    .from("roundtable_topics")
    .insert({
      title: params.title,
      description: params.description?.trim() || null,
      tags,
      created_by_profile_id: params.actor.profileId,
      created_by_guest_id: params.actor.guestId,
    })
    .select("id")
    .single();

  if (topicError || !topic?.id) {
    throw new Error(topicError?.message ?? "Unable to create topic.");
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .insert({
      topic_id: topic.id,
      status: "lobby",
      max_seats: 5,
      turn_duration_sec: params.turnDurationSec,
      created_by_profile_id: params.actor.profileId,
      created_by_guest_id: params.actor.guestId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session?.id) {
    throw new Error(sessionError?.message ?? "Unable to create session.");
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from("roundtable_members")
    .insert({
      session_id: session.id,
      seat_no: 1,
      profile_id: params.actor.profileId,
      guest_id: params.actor.guestId,
      display_name: params.actor.displayName,
      state: "joined",
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (memberError || !member?.id) {
    throw new Error(memberError?.message ?? "Unable to reserve creator seat.");
  }

  const { error: scoreError } = await supabaseAdmin
    .from("roundtable_scores")
    .upsert(
      {
        session_id: session.id,
        member_id: member.id,
        points: 0,
        approved_turns: 0,
        upvotes_received: 0,
        useful_marks: 0,
        violations: 0,
      },
      { onConflict: "session_id,member_id" }
    );

  if (scoreError) {
    throw new Error(scoreError.message);
  }

  return {
    topicId: topic.id,
    sessionId: session.id,
    memberId: member.id,
    tags,
  };
};
