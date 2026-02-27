import { supabaseAdmin } from "@/lib/supabase/server";

export const ROUND_TABLE_POINTS = {
  approvedTurn: 5,
  upvote: 10,
  usefulMark: 20,
  violation: -10,
} as const;

type ScoreDelta = {
  points?: number;
  approvedTurns?: number;
  upvotesReceived?: number;
  usefulMarks?: number;
  violations?: number;
};

export const applyScoreDelta = async (
  sessionId: string,
  memberId: string,
  delta: ScoreDelta
) => {
  const { data: current, error: loadError } = await supabaseAdmin
    .from("roundtable_scores")
    .select("session_id, member_id, points, approved_turns, upvotes_received, useful_marks, violations")
    .eq("session_id", sessionId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }

  const existing = current ?? {
    session_id: sessionId,
    member_id: memberId,
    points: 0,
    approved_turns: 0,
    upvotes_received: 0,
    useful_marks: 0,
    violations: 0,
  };

  const payload = {
    session_id: sessionId,
    member_id: memberId,
    points: existing.points + (delta.points ?? 0),
    approved_turns: existing.approved_turns + (delta.approvedTurns ?? 0),
    upvotes_received: existing.upvotes_received + (delta.upvotesReceived ?? 0),
    useful_marks: existing.useful_marks + (delta.usefulMarks ?? 0),
    violations: existing.violations + (delta.violations ?? 0),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("roundtable_scores")
    .upsert(payload, { onConflict: "session_id,member_id" });

  if (error) {
    throw new Error(error.message);
  }
};
