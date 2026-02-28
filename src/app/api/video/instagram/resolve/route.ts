import { NextResponse } from "next/server";
import { applyPublicEdgeCache } from "@/lib/http/cache";
import {
  buildInstagramEmbedUrl,
  fetchInstagramMediaUrls,
  normalizeInstagramUrl,
} from "@/lib/video/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get("url");
  const normalized = normalizeInstagramUrl(urlParam);

  if (!normalized) {
    return NextResponse.json({ error: "Invalid Instagram URL." }, { status: 400 });
  }

  const media = await fetchInstagramMediaUrls(normalized);
  const embedBase = buildInstagramEmbedUrl(normalized);
  const embedUrl = embedBase ? `${embedBase}?autoplay=1&muted=1` : null;

  const response = NextResponse.json({
    instagram_url: normalized,
    video_url: media.videoUrl,
    thumbnail_url: media.thumbnailUrl,
    embed_url: embedUrl,
  });

  applyPublicEdgeCache(response, {
    sMaxAgeSeconds: 900,
    staleWhileRevalidateSeconds: 3600,
  });

  return response;
}
