import { NextResponse } from "next/server";
import { getMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, resolveActor, withGuestCookie } from "@/lib/roundtable/api";

type CameraPayload = {
  display_name?: string;
  state?: "off" | "live";
};

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<CameraPayload>(request);
  const nextState = payload?.state;
  if (nextState !== "off" && nextState !== "live") {
    return NextResponse.json({ error: "Invalid camera state." }, { status: 400 });
  }

  const actor = await resolveActor(request, payload?.display_name ?? null);

  try {
    const member = await getMemberForActor(params.sessionId, actor);
    if (!member?.id) {
      return NextResponse.json({ error: "Not joined in this session." }, { status: 404 });
    }

    const persisted = await logRoundtableEvent(
      "roundtable_camera_state_changed",
      {
        session_id: params.sessionId,
        member_id: member.id,
        state: nextState,
      },
      actor.profileId
    );
    if (!persisted) {
      console.error("roundtable camera state persistence fell back to client-only mode", {
        sessionId: params.sessionId,
        memberId: member.id,
        nextState,
      });
    }

    const response = NextResponse.json({ ok: true, state: nextState }, { status: 200 });
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update camera state.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
