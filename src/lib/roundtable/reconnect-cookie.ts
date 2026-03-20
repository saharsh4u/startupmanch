import { createHmac, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";
import { ROUND_TABLE_PRESENCE } from "@/lib/roundtable/constants";

type ReconnectPayload = {
  session_id: string;
  member_id: string;
  seat_no: number;
  exp: number;
};

export const ROUNDTABLE_RECONNECT_COOKIE = "rt_reconnect";

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const getSecret = () =>
  process.env.ROUNDTABLE_RECONNECT_SECRET?.trim() ||
  process.env.ROUNDTABLE_INVITE_SECRET?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  "startupmanch-roundtable-reconnect-secret";

const sign = (value: string) => createHmac("sha256", getSecret()).update(value).digest("base64url");

const parseCookieHeader = (value: string | null) => {
  const cookies = new Map<string, string>();
  for (const part of String(value ?? "").split(";")) {
    const [rawName, ...rest] = part.split("=");
    const name = rawName?.trim();
    if (!name) continue;
    cookies.set(name, rest.join("=").trim());
  }
  return cookies;
};

export const readRoundtableReconnectToken = (request: Request) =>
  parseCookieHeader(request.headers.get("cookie")).get(ROUNDTABLE_RECONNECT_COOKIE) ?? null;

export const createRoundtableReconnectToken = (params: {
  sessionId: string;
  memberId: string;
  seatNo: number;
  expiresInMs?: number;
}) => {
  const payload: ReconnectPayload = {
    session_id: params.sessionId,
    member_id: params.memberId,
    seat_no: params.seatNo,
    exp: Date.now() + (params.expiresInMs ?? ROUND_TABLE_PRESENCE.reconnectGraceMs),
  };

  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifyRoundtableReconnectToken = (token: string | null | undefined) => {
  const rawToken = token?.trim() ?? "";
  if (!rawToken) return null;

  const [encodedPayload, encodedSignature] = rawToken.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decode(encodedPayload)) as ReconnectPayload;
    if (
      !parsed?.session_id ||
      !parsed?.member_id ||
      !Number.isInteger(parsed?.seat_no) ||
      !parsed?.exp ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const buildCookieOptions = (maxAgeMs: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.max(1, Math.ceil(maxAgeMs / 1000)),
});

export const setRoundtableReconnectCookie = (
  response: NextResponse,
  params: {
    sessionId: string;
    memberId: string;
    seatNo: number;
    expiresInMs?: number;
  }
) => {
  const maxAgeMs = params.expiresInMs ?? ROUND_TABLE_PRESENCE.reconnectGraceMs;
  response.cookies.set(
    ROUNDTABLE_RECONNECT_COOKIE,
    createRoundtableReconnectToken({
      sessionId: params.sessionId,
      memberId: params.memberId,
      seatNo: params.seatNo,
      expiresInMs: maxAgeMs,
    }),
    buildCookieOptions(maxAgeMs)
  );
  return response;
};

export const clearRoundtableReconnectCookie = (response: NextResponse) => {
  response.cookies.set(ROUNDTABLE_RECONNECT_COOKIE, "", {
    ...buildCookieOptions(1),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
};
