import { NextResponse } from "next/server";
import { assertRateLimit } from "@/lib/security/rate-limit";
import { verifyCaptchaToken } from "@/lib/security/captcha";
import { getRoundtableActor, hashIp, normalizeDisplayName, readIp } from "@/lib/roundtable/server";

export const runtime = "nodejs";

export const withGuestCookie = (response: NextResponse, guestId: string | null) => response;

export const parseJsonSafely = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

export const requireCaptcha = async (
  request: Request,
  token: string | null | undefined
) => {
  const valid = await verifyCaptchaToken((token ?? "").trim(), readIp(request));
  return valid;
};

export const requireRateLimit = async (params: {
  request: Request;
  actionType: string;
  maxCount: number;
  windowMs: number;
  guestId?: string | null;
  sessionId?: string | null;
}) => {
  const ipHash = hashIp(readIp(params.request));
  return assertRateLimit({
    actionType: params.actionType,
    maxCount: params.maxCount,
    windowMs: params.windowMs,
    guestId: params.guestId ?? null,
    ipHash,
    sessionId: params.sessionId ?? null,
  });
};

export const resolveActor = async (request: Request, displayName?: string | null) => {
  const actor = await getRoundtableActor(request, displayName ?? null);
  return {
    ...actor,
    displayName: normalizeDisplayName(displayName ?? actor.displayName ?? "Guest"),
  };
};
