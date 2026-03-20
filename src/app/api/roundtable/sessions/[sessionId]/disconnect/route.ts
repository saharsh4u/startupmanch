import { NextResponse } from "next/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { setRoundtableReconnectCookie } from "@/lib/roundtable/reconnect-cookie";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type DisconnectPayload = {
  display_name?: string;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = (await parseJsonSafely<DisconnectPayload>(request)) ?? {};
  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    const member = await getMemberForActor(params.sessionId, actor);
    if (!member?.id) {
      const response = NextResponse.json({ ok: true }, { status: 200 });
      return withGuestCookie(response, actor.guestId);
    }

    const disconnectedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("roundtable_members")
      .update({
        state: "left",
        left_at: disconnectedAt,
      })
      .eq("id", member.id)
      .eq("state", "joined");

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: disconnectedAt })
      .eq("id", params.sessionId);

    await logRoundtableEvent(
      "roundtable_member_disconnected",
      {
        session_id: params.sessionId,
        member_id: member.id,
        seat_no: member.seat_no,
      },
      actor.profileId
    );

    const response = NextResponse.json({ ok: true }, { status: 200 });
    setRoundtableReconnectCookie(response, {
      sessionId: params.sessionId,
      memberId: member.id,
      seatNo: member.seat_no,
    });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to preserve reconnect seat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
