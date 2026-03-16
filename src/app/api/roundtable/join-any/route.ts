import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS } from "@/lib/roundtable/constants";
import { joinRoundtableSession } from "@/lib/roundtable/join-session";
import { getLatestJoinedMemberForActor, logRoundtableEvent } from "@/lib/roundtable/server";
import {
  parseJsonSafely,
  requireCaptcha,
  requireRateLimit,
  resolveActor,
  withGuestCookie,
} from "@/lib/roundtable/api";
import { reconcileOpenSessions } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";

type JoinAnyPayload = {
  display_name?: string;
  captcha_token?: string;
};

type JoinAnyErrorCode =
  | "invalid_payload"
  | "captcha_failed"
  | "rate_limited"
  | "already_joined"
  | "no_open_rooms"
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

export async function POST(request: Request) {
  const payload = await parseJsonSafely<JoinAnyPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload.", code: "invalid_payload" }, { status: 400 });
  }

  const actor: Actor | null = await resolveActor(request, payload.display_name ?? null);

  const respondError = async (
    status: number,
    code: JoinAnyErrorCode,
    message: string,
    metadata?: Record<string, unknown>
  ) => {
    await logRoundtableEvent(
      "roundtable_join_any_failed",
      {
        result_code: code,
        http_status: status,
        ...actorMetadata(actor),
        ...(metadata ?? {}),
      },
      actor?.profileId ?? null
    );

    const response = NextResponse.json({ error: message, code, ...(metadata ?? {}) }, { status });
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
    actionType: "roundtable_join_any",
    maxCount: ROUND_TABLE_LIMITS.joinSession.maxCount,
    windowMs: ROUND_TABLE_LIMITS.joinSession.windowMs,
    guestId: actor.guestId,
  });

  if (!rateAllowed) {
    return respondError(429, "rate_limited", "Rate limit exceeded.");
  }

  try {
    const existingJoinedMember = await getLatestJoinedMemberForActor(actor);
    if (existingJoinedMember?.session_id) {
      return respondError(
        409,
        "already_joined",
        "Leave your current roundtable seat before joining another room.",
        { session_id: existingJoinedMember.session_id }
      );
    }

    await reconcileOpenSessions(40);

    const { data: sessionRows, error: sessionError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id, status, max_seats, created_at")
      .in("status", ["lobby", "live"])
      .order("created_at", { ascending: true })
      .limit(80);

    if (sessionError) {
      return respondError(500, "join_failed", sessionError.message);
    }

    const sessions = (sessionRows ?? []) as Array<{
      id: string;
      status: "lobby" | "live";
      max_seats: number;
      created_at: string;
    }>;

    if (!sessions.length) {
      return respondError(404, "no_open_rooms", "No open roundtables are available right now.");
    }

    const sessionIds = sessions.map((session) => session.id);
    const joinedCountBySession = new Map<string, number>();

    const { data: memberRows, error: memberError } = await supabaseAdmin
      .from("roundtable_members")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("state", "joined");

    if (memberError) {
      return respondError(500, "join_failed", memberError.message);
    }

    for (const row of memberRows ?? []) {
      const sessionId = String(row.session_id);
      joinedCountBySession.set(sessionId, (joinedCountBySession.get(sessionId) ?? 0) + 1);
    }

    const candidates = sessions
      .map((session) => ({
        ...session,
        joinedCount: joinedCountBySession.get(session.id) ?? 0,
      }))
      .filter((session) => session.joinedCount < Math.max(1, Number(session.max_seats) || 5))
      .sort((left, right) => {
        const leftRank =
          left.status === "live" && left.joinedCount > 0
            ? 0
            : left.status === "lobby" && left.joinedCount > 0
              ? 1
              : 2;
        const rightRank =
          right.status === "live" && right.joinedCount > 0
            ? 0
            : right.status === "lobby" && right.joinedCount > 0
              ? 1
              : 2;

        if (leftRank !== rightRank) return leftRank - rightRank;
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      });

    if (!candidates.length) {
      return respondError(404, "no_open_rooms", "No open roundtables are available right now.");
    }

    for (const candidate of candidates) {
      const result = await joinRoundtableSession({
        sessionId: candidate.id,
        actor,
        requestedSeatNo: null,
      });

      if (!result.ok) {
        if (
          result.code === "room_full" ||
          result.code === "seat_taken_retry_exhausted" ||
          result.code === "session_closed" ||
          result.code === "session_not_found"
        ) {
          continue;
        }

        return respondError(result.status, "join_failed", result.error, {
          session_id: candidate.id,
          result_code: result.code,
        });
      }

      await logRoundtableEvent(
        "roundtable_join_any_success",
        {
          session_id: candidate.id,
          member_id: result.member.id,
          seat_no: result.member.seat_no,
          join_status: result.code,
          ...actorMetadata(actor),
        },
        actor?.profileId ?? null
      );

      const response = NextResponse.json(
        {
          ok: true,
          session_id: candidate.id,
          member_id: result.member.id,
          seat_no: result.member.seat_no,
        },
        { status: 200 }
      );
      return withGuestCookie(response, actor?.guestId ?? null);
    }

    return respondError(404, "no_open_rooms", "No open roundtables are available right now.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join a roundtable right now.";
    return respondError(500, "join_failed", message);
  }
}
