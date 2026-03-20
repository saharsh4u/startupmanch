import { NextResponse } from "next/server";
import { getOrCreatePitchGuestVoteKey, setPitchGuestVoteCookie } from "@/lib/pitches/guest-vote-cookie";
import { loadPitchVoteStat, upsertGuestPitchVote } from "@/lib/pitches/stats";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authContext = await getAuthContext(request);
  const { id } = params;
  const payload = await request.json();
  const vote = payload?.vote;
  const reason =
    authContext && requireRole(authContext, ["founder", "investor", "admin"])
      ? payload?.reason ?? null
      : null;

  if (vote !== "in" && vote !== "out") {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }

  const { data: pitch, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .select("id,status")
    .eq("id", id)
    .maybeSingle();
  if (pitchError) {
    return NextResponse.json({ error: pitchError.message }, { status: 500 });
  }
  if (!pitch || pitch.status !== "approved") {
    return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
  }

  const canVoteAsAuthenticated = requireRole(authContext, ["founder", "investor", "admin"]);
  const guestVoteKey = canVoteAsAuthenticated ? null : getOrCreatePitchGuestVoteKey(request);

  try {
    if (canVoteAsAuthenticated && authContext) {
      const { data, error } = await supabaseAdmin
        .from("pitch_votes")
        .upsert(
          {
            pitch_id: id,
            voter_id: authContext.userId,
            vote,
            reason,
          },
          { onConflict: "pitch_id,voter_id" }
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const stats = await loadPitchVoteStat(id);
      return NextResponse.json({
        vote: data,
        mode: "authenticated",
        stats: {
          in_count: stats.inCount,
          out_count: stats.outCount,
          comment_count: 0,
        },
      });
    }

    if (!guestVoteKey) {
      return NextResponse.json({ error: "Unable to determine guest vote identity." }, { status: 500 });
    }

    await upsertGuestPitchVote({
      pitchId: id,
      guestKey: guestVoteKey,
      vote,
    });

    const stats = await loadPitchVoteStat(id);
    const response = NextResponse.json({
      mode: "guest",
      stats: {
        in_count: stats.inCount,
        out_count: stats.outCount,
        comment_count: 0,
      },
    });
    setPitchGuestVoteCookie(response, { guestKey: guestVoteKey });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to vote.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
