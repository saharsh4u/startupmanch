import { NextResponse } from "next/server";
import { logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";

type ShareSeatPayload = {
  seat_no?: number;
  inviter_member_id?: string | null;
  source?: string | null;
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<ShareSeatPayload>(request);
  if (!payload || !Number.isInteger(payload.seat_no)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const actor = await resolveActor(request);

  await logRoundtableEvent(
    "roundtable_seat_share_copied",
    {
      session_id: params.sessionId,
      seat_no: Number(payload.seat_no),
      inviter_member_id: payload.inviter_member_id ?? null,
      source: payload.source ?? "invite",
      actor_type: actor.profileId ? "profile" : "guest",
      profile_id: actor.profileId ?? null,
      guest_id: actor.guestId ?? null,
    },
    actor.profileId ?? null
  );

  const response = NextResponse.json({ ok: true }, { status: 200 });
  return withGuestCookie(response, actor.guestId ?? null);
}
