import { NextResponse } from "next/server";

type EdgeCacheConfig = {
  sMaxAgeSeconds: number;
  staleWhileRevalidateSeconds: number;
  browserMaxAgeSeconds?: number;
};

const clampToPositiveInt = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

export const applyPublicEdgeCache = (
  response: NextResponse,
  config: EdgeCacheConfig
) => {
  const browserMaxAge = clampToPositiveInt(config.browserMaxAgeSeconds ?? 0, 0);
  const sMaxAge = clampToPositiveInt(config.sMaxAgeSeconds, 60);
  const staleWhileRevalidate = clampToPositiveInt(
    config.staleWhileRevalidateSeconds,
    300
  );
  const cacheValue = `public, max-age=${browserMaxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;

  response.headers.set("Cache-Control", cacheValue);
  response.headers.set("CDN-Cache-Control", cacheValue);
  response.headers.set("Vercel-CDN-Cache-Control", cacheValue);
};
