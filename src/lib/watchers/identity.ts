import { randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const WATCHER_COOKIE_NAME = "sm_watch_id";

const WATCHER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;
const WATCHER_ID_PATTERN = /^[a-zA-Z0-9_-]{12,120}$/;

const sanitizeWatcherId = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (!WATCHER_ID_PATTERN.test(normalized)) return null;
  return normalized;
};

const watcherCookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: WATCHER_COOKIE_MAX_AGE,
};

export const readAnonWatchId = (request: NextRequest) =>
  sanitizeWatcherId(request.cookies.get(WATCHER_COOKIE_NAME)?.value);

export const ensureAnonWatchId = (request: NextRequest, response: NextResponse) => {
  const existing = readAnonWatchId(request);
  if (existing) return existing;

  const generated = randomUUID().replace(/-/g, "");
  response.cookies.set(WATCHER_COOKIE_NAME, generated, watcherCookieOptions);
  return generated;
};

