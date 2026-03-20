import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";

type GuestVotePayload = {
  guest_key: string;
  exp: number;
};

export const PITCH_GUEST_VOTE_COOKIE = "pitch_vote_guest";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const getSecret = () =>
  process.env.PITCH_GUEST_VOTE_SECRET?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  "startupmanch-pitch-guest-vote-secret";

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

export const readPitchGuestVoteToken = (request: Request) =>
  parseCookieHeader(request.headers.get("cookie")).get(PITCH_GUEST_VOTE_COOKIE) ?? null;

export const createPitchGuestVoteToken = (params?: {
  guestKey?: string;
  expiresInMs?: number;
}) => {
  const payload: GuestVotePayload = {
    guest_key: params?.guestKey?.trim() || randomUUID(),
    exp: Date.now() + (params?.expiresInMs ?? ONE_YEAR_MS),
  };

  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifyPitchGuestVoteToken = (token: string | null | undefined) => {
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
    const parsed = JSON.parse(decode(encodedPayload)) as GuestVotePayload;
    if (!parsed?.guest_key || !parsed?.exp || parsed.exp < Date.now()) {
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

export const getOrCreatePitchGuestVoteKey = (request: Request) => {
  const existing = verifyPitchGuestVoteToken(readPitchGuestVoteToken(request));
  return existing?.guest_key ?? randomUUID();
};

export const setPitchGuestVoteCookie = (
  response: NextResponse,
  params: {
    guestKey: string;
    expiresInMs?: number;
  }
) => {
  const maxAgeMs = params.expiresInMs ?? ONE_YEAR_MS;
  response.cookies.set(
    PITCH_GUEST_VOTE_COOKIE,
    createPitchGuestVoteToken({
      guestKey: params.guestKey,
      expiresInMs: maxAgeMs,
    }),
    buildCookieOptions(maxAgeMs)
  );
  return response;
};
