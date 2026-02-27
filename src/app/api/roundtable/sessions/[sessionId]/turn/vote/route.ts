import { NextResponse } from "next/server";
import { applyScoreDelta, ROUND_TABLE_POINTS } from "@/lib/roundtable/scoring";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { supabaseAdmin } from "@/lib/supabase/server";

type VotePayload = {
  display_name?: string;
  turn_id?: string;
  vote?: 1 | -1;
  mark_useful?: boolean;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<VotePayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    const voterMember = await getMemberForActor(params.sessionId, actor);
    if (!voterMember?.id) {
      return NextResponse.json({ error: "Join the session first." }, { status: 403 });
    }

    const turnId = (payload.turn_id ?? "").trim();
    const vote = Number(payload.vote);
    const markUseful = Boolean(payload.mark_useful);

    if (!turnId || (vote !== 1 && vote !== -1)) {
      return NextResponse.json({ error: "turn_id and vote (1 or -1) are required." }, { status: 400 });
    }

    const { data: turn, error: turnError } = await supabaseAdmin
      .from("roundtable_turns")
      .select("id, member_id, status, hidden_for_abuse")
      .eq("id", turnId)
      .eq("session_id", params.sessionId)
      .maybeSingle();

    if (turnError) {
      return NextResponse.json({ error: turnError.message }, { status: 500 });
    }

    if (!turn?.id) {
      return NextResponse.json({ error: "Turn not found." }, { status: 404 });
    }

    if (turn.hidden_for_abuse) {
      return NextResponse.json({ error: "Turn unavailable." }, { status: 400 });
    }

    if (!["submitted", "expired"].includes(turn.status)) {
      return NextResponse.json({ error: "Turn is not votable yet." }, { status: 400 });
    }

    if (turn.member_id === voterMember.id) {
      return NextResponse.json({ error: "Cannot vote on your own turn." }, { status: 400 });
    }

    const { data: existingVote, error: existingVoteError } = await supabaseAdmin
      .from("roundtable_turn_votes")
      .select("id, vote")
      .eq("turn_id", turn.id)
      .eq("voter_member_id", voterMember.id)
      .maybeSingle();

    if (existingVoteError) {
      return NextResponse.json({ error: existingVoteError.message }, { status: 500 });
    }

    const { error: upsertError } = await supabaseAdmin
      .from("roundtable_turn_votes")
      .upsert(
        {
          turn_id: turn.id,
          session_id: params.sessionId,
          voter_member_id: voterMember.id,
          vote,
        },
        { onConflict: "turn_id,voter_member_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    if (vote === 1 && (!existingVote?.id || existingVote.vote !== 1)) {
      await applyScoreDelta(params.sessionId, turn.member_id as string, {
        points: ROUND_TABLE_POINTS.upvote,
        upvotesReceived: 1,
      });
    }

    if (markUseful && vote === 1) {
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("roundtable_sessions")
        .select("created_by_profile_id, created_by_guest_id")
        .eq("id", params.sessionId)
        .maybeSingle();

      if (!sessionError && session) {
        const isCreator =
          (session.created_by_profile_id && actor.profileId === session.created_by_profile_id) ||
          (session.created_by_guest_id && actor.guestId === session.created_by_guest_id);

        if (isCreator && (!existingVote?.id || existingVote.vote !== 1)) {
          await applyScoreDelta(params.sessionId, turn.member_id as string, {
            points: ROUND_TABLE_POINTS.usefulMark,
            usefulMarks: 1,
          });
        }
      }
    }

    await logRoundtableEvent("roundtable_vote_cast", {
      session_id: params.sessionId,
      turn_id: turn.id,
      voter_member_id: voterMember.id,
      vote,
      mark_useful: markUseful,
    }, actor.profileId);

    const response = NextResponse.json({ ok: true }, { status: 200 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cast vote.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
