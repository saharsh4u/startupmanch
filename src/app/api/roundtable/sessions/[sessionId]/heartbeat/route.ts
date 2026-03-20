import { NextResponse } from "next/server";
import { setRoundtableReconnectCookie } from "@/lib/roundtable/reconnect-cookie";
import { resolveActor } from "@/lib/roundtable/api";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const actor = await resolveActor(request);

  try {
    const member = await getMemberForActor(params.sessionId, actor);
    if (!member?.id) {
      return NextResponse.json({ error: "Not joined in this session." }, { status: 404 });
    }

    await logRoundtableEvent(
      "roundtable_member_heartbeat",
      {
        session_id: params.sessionId,
        member_id: member.id,
      },
      actor.profileId
    );

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.sessionId);

    const response = NextResponse.json({ ok: true }, { status: 200 });
    setRoundtableReconnectCookie(response, {
      sessionId: params.sessionId,
      memberId: member.id,
      seatNo: member.seat_no,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh presence.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
