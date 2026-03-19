import { NextResponse } from "next/server";
import { createRoundtableInviteToken } from "@/lib/roundtable/invite-token";
import { resolveActor } from "@/lib/roundtable/api";
import { getSessionSnapshot } from "@/lib/roundtable/queries";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";

type InvitePayload = {
  seat_no?: number | null;
};

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

    const snapshot = await getSessionSnapshot(params.sessionId);
    if (!snapshot) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    let seatNo: number | null = null;
    try {
      const payload = (await request.json()) as InvitePayload;
      seatNo = Number.isInteger(payload?.seat_no) ? Number(payload.seat_no) : null;
    } catch {
      seatNo = null;
    }

    const baseUrl = new URL(request.url);
    const inviteUrl = new URL(`/roundtable/${params.sessionId}`, baseUrl.origin);
    inviteUrl.searchParams.set("source", "invite");
    if (seatNo) {
      inviteUrl.searchParams.set("seat", String(seatNo));
    }
    inviteUrl.searchParams.set("inviter", member.id);

    let token: string | null = null;
    if (snapshot.session.visibility === "private") {
      token = createRoundtableInviteToken({
        sessionId: params.sessionId,
        seatNo,
      });
      inviteUrl.searchParams.set("invite", token);
    }

    await logRoundtableEvent(
      "roundtable_seat_invite_created",
      {
        session_id: params.sessionId,
        member_id: member.id,
        seat_no: seatNo,
        visibility: snapshot.session.visibility,
      },
      actor.profileId
    );

    return NextResponse.json(
      {
        ok: true,
        url: inviteUrl.toString(),
        token,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invite.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
