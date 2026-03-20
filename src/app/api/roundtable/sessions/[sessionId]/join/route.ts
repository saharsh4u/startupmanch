import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS } from "@/lib/roundtable/constants";
import { verifyRoundtableInviteToken } from "@/lib/roundtable/invite-token";
import { setRoundtableReconnectCookie } from "@/lib/roundtable/reconnect-cookie";
import { joinRoundtableSession } from "@/lib/roundtable/join-session";
import { getSessionSnapshot } from "@/lib/roundtable/queries";
import { getReconnectReservationForRequest, logRoundtableEvent } from "@/lib/roundtable/server";
import { parseJsonSafely, requireCaptcha, requireRateLimit, resolveActor, withGuestCookie } from "@/lib/roundtable/api";

type JoinPayload = {
  display_name?: string;
  seat_no?: number;
  captcha_token?: string;
  invite_token?: string | null;
};

type JoinErrorCode =
  | "invalid_payload"
  | "captcha_failed"
  | "rate_limited"
  | "session_not_found"
  | "session_closed"
  | "room_full"
  | "invite_required"
  | "identity_conflict"
  | "seat_taken_retry_exhausted"
  | "join_failed";

type Actor = Awaited<ReturnType<typeof resolveActor>>;

const actorMetadata = (actor: Actor | null) => ({
  actor_type: actor?.profileId ? "profile" : "guest",
  guest_id_hash: actor?.guestId
    ? createHash("sha256").update(actor.guestId).digest("hex").slice(0, 24)
    : null,
  profile_id: actor?.profileId ?? null,
});

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const payload = await parseJsonSafely<JoinPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload.", code: "invalid_payload" }, { status: 400 });
  }

  const actor: Actor | null = await resolveActor(request, payload.display_name ?? null);
  const snapshot = await getSessionSnapshot(params.sessionId);
  if (!snapshot) {
    return NextResponse.json({ error: "Session not found.", code: "session_not_found" }, { status: 404 });
  }

  const invite = verifyRoundtableInviteToken(payload.invite_token ?? null);
  const hasValidInvite = Boolean(invite && invite.session_id === params.sessionId);
  const reconnectReservation = await getReconnectReservationForRequest(request, params.sessionId);
  if (snapshot.session.visibility === "private" && !hasValidInvite && !reconnectReservation) {
    return NextResponse.json(
      { error: "This private room requires a valid invite.", code: "invite_required" },
      { status: 403 }
    );
  }

  const requestedSeatNo = Number.isInteger(payload.seat_no)
    ? Number(payload.seat_no)
    : Number.isInteger(invite?.seat_no)
      ? Number(invite?.seat_no)
      : null;

  const emitJoinAttempt = async (
    code: JoinErrorCode | "joined" | "already_joined",
    status: number,
    metadata?: Record<string, unknown>
  ) => {
    await logRoundtableEvent(
      "roundtable_join_attempt",
      {
        session_id: params.sessionId,
        requested_seat_no: requestedSeatNo,
        result_code: code,
        http_status: status,
        ...actorMetadata(actor),
        ...(metadata ?? {}),
      },
      actor?.profileId ?? null
    );
  };

  const respondError = async (
    status: number,
    code: JoinErrorCode,
    message: string,
    metadata?: Record<string, unknown>
  ) => {
    await emitJoinAttempt(code, status, metadata);
    const response = NextResponse.json({ error: message, code }, { status });
    return withGuestCookie(response, actor?.guestId ?? null);
  };

  const respondSuccess = async (
    status: number,
    member: { id: string; seat_no: number },
    code: "joined" | "already_joined",
    metadata?: Record<string, unknown>
  ) => {
    await emitJoinAttempt(code, status, {
      member_id: member.id,
      seat_no: member.seat_no,
      ...(metadata ?? {}),
    });

    await logRoundtableEvent(
      "roundtable_join_success",
      {
        session_id: params.sessionId,
        member_id: member.id,
        seat_no: member.seat_no,
        ...actorMetadata(actor),
      },
      actor?.profileId ?? null
    );

    const response = NextResponse.json({ ok: true, member_id: member.id, seat_no: member.seat_no }, { status });
    setRoundtableReconnectCookie(response, {
      sessionId: params.sessionId,
      memberId: member.id,
      seatNo: member.seat_no,
    });
    return withGuestCookie(response, actor?.guestId ?? null);
  };

  const captchaToken = (payload.captcha_token ?? "").trim();
  if (captchaToken.length) {
    const captchaValid = await requireCaptcha(request, captchaToken);
    if (!captchaValid) {
      return respondError(400, "captcha_failed", "Captcha validation failed.");
    }
  }

  const rateAllowed = await requireRateLimit({
    request,
    actionType: "roundtable_session_join",
    maxCount: ROUND_TABLE_LIMITS.joinSession.maxCount,
    windowMs: ROUND_TABLE_LIMITS.joinSession.windowMs,
    guestId: actor.guestId,
    sessionId: params.sessionId,
  });

  if (!rateAllowed) {
    return respondError(429, "rate_limited", "Rate limit exceeded.");
  }

  try {
    const result = await joinRoundtableSession({
      sessionId: params.sessionId,
      actor,
      requestedSeatNo,
      reconnectMemberId: reconnectReservation?.id ?? null,
    });

    if (!result.ok) {
      return respondError(result.status, result.code, result.error, result.metadata);
    }

    return respondSuccess(result.status, result.member, result.code, {
      attempt: result.attempt,
      ...(result.metadata ?? {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join session.";
    return respondError(500, "join_failed", message);
  }
}
