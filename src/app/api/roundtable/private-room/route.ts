import { NextResponse } from "next/server";
import { createRoundtableSession } from "@/lib/roundtable/create-session";
import { setRoundtableReconnectCookie } from "@/lib/roundtable/reconnect-cookie";
import { logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileOpenSessions } from "@/lib/roundtable/reconcile";

export const runtime = "nodejs";

type PrivateRoomPayload = {
  display_name?: string;
};

export async function POST(request: Request) {
  const payload = (await parseJsonSafely<PrivateRoomPayload>(request)) ?? {};
  const actor = await resolveActor(request, payload.display_name ?? null);

  try {
    await reconcileOpenSessions();

    const created = await createRoundtableSession({
      actor,
      title: "Private roundtable",
      description: "Invite friends into your private founder room.",
      tags: [],
      turnDurationSec: 60,
      visibility: "private",
    });

    await logRoundtableEvent(
      "roundtable_private_room_created",
      {
        session_id: created.sessionId,
        topic_id: created.topicId,
        member_id: created.memberId,
      },
      actor.profileId
    );

    const response = NextResponse.json(
      {
        ok: true,
        session_id: created.sessionId,
        member_id: created.memberId,
      },
      { status: 201 }
    );
    setRoundtableReconnectCookie(response, {
      sessionId: created.sessionId,
      memberId: created.memberId,
      seatNo: 1,
    });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create private roundtable.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
