const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const INSTAGRAM_PATH_PREFIXES = new Set(["reel", "p", "tv"]);
const INSTAGRAM_FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "upgrade-insecure-requests": "1",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "cache-control": "no-cache",
  pragma: "no-cache",
};

const trimToNull = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
};

export const isExternalMediaUrl = (value: string | null | undefined) => {
  const normalized = trimToNull(value);
  if (!normalized) return false;
  return /^https?:\/\//i.test(normalized);
};

const decodeHtmlEntities = (input: string) =>
  input
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const decodeEscapedMediaUrl = (input: string) =>
  decodeHtmlEntities(input)
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0025/gi, "%")
    .replace(/\\+\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

const normalizeExtractedMediaUrl = (value: string | null | undefined) => {
  const normalized = trimToNull(value);
  if (!normalized) return null;
  const decoded = decodeEscapedMediaUrl(normalized);
  return isExternalMediaUrl(decoded) ? decoded : null;
};

export const normalizeInstagramUrl = (value: string | null | undefined) => {
  const normalized = trimToNull(value);
  if (!normalized) return null;

  const extractUrlFromEmbedSnippet = (input: string) => {
    const decoded = decodeHtmlEntities(input);
    const permalinkMatch = decoded.match(/data-instgrm-permalink\s*=\s*["']([^"']+)["']/i);
    if (permalinkMatch?.[1]) return permalinkMatch[1];

    const hrefMatch = decoded.match(/href\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch?.[1]) return hrefMatch[1];

    const inlineUrlMatch = decoded.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/i);
    if (inlineUrlMatch?.[0]) return inlineUrlMatch[0];

    return null;
  };

  const toCanonical = (kind: string, code: string) => {
    const normalizedKind = kind.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!INSTAGRAM_PATH_PREFIXES.has(normalizedKind)) return null;
    if (!normalizedCode.length) return null;
    return `https://www.instagram.com/${normalizedKind}/${normalizedCode}/`;
  };

  const parseSegments = (segments: string[]) => {
    if (segments.length >= 2 && INSTAGRAM_PATH_PREFIXES.has(segments[0]?.toLowerCase() ?? "")) {
      return toCanonical(segments[0], segments[1]);
    }
    if (segments.length >= 3 && INSTAGRAM_PATH_PREFIXES.has(segments[1]?.toLowerCase() ?? "")) {
      return toCanonical(segments[1], segments[2]);
    }
    return null;
  };

  try {
    const embedCandidate = normalized.includes("<")
      ? extractUrlFromEmbedSnippet(normalized)
      : null;
    const candidate = embedCandidate ?? normalized;

    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (!INSTAGRAM_HOSTS.has(host)) return null;

    const segments = url.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    return parseSegments(segments);
  } catch {
    const embedCandidate = normalized.includes("<")
      ? extractUrlFromEmbedSnippet(normalized)
      : null;
    const source = embedCandidate ?? normalized;

    const stripped = source
      .replace(/^https?:\/\//i, "")
      .replace(/^((www|m)\.)?instagram\.com\//i, "")
      .replace(/^\/+/, "");
    const segments = stripped
      .split("/")
      .map((part) => part.trim().replace(/^@/, ""))
      .filter(Boolean);
    return parseSegments(segments);
  }
};

export const buildInstagramEmbedUrl = (value: string | null | undefined) => {
  const normalized = normalizeInstagramUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const segments = url.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (segments.length < 2) return null;
    const kind = segments[0];
    const code = segments[1];
    return `https://www.instagram.com/${kind}/${code}/embed/`;
  } catch {
    return null;
  }
};

const escapeRegExp = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseMetaByProperties = (html: string, properties: string[]) => {
  for (const property of properties) {
    const escaped = escapeRegExp(property);
    const matchByPropertyFirst = html.match(
      new RegExp(
        `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i"
      )
    );
    const resolvedByPropertyFirst = normalizeExtractedMediaUrl(matchByPropertyFirst?.[1] ?? null);
    if (resolvedByPropertyFirst) return resolvedByPropertyFirst;

    const matchByContentFirst = html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`,
        "i"
      )
    );
    const resolvedByContentFirst = normalizeExtractedMediaUrl(matchByContentFirst?.[1] ?? null);
    if (resolvedByContentFirst) return resolvedByContentFirst;
  }
  return null;
};

const parseOpenGraphImage = (html: string) =>
  parseMetaByProperties(html, ["og:image", "og:image:url"]);

const parseOpenGraphVideo = (html: string) => {
  const openGraph = parseMetaByProperties(html, [
    "og:video:secure_url",
    "og:video",
    "og:video:url",
  ]);
  if (openGraph) return openGraph;

  const normalizedJsonLike = html.replace(/\\"/g, '"');

  const jsonPatterns = [
    /"video_url":"([^"]+)"/i,
    /"contentUrl":"([^"]+)"/i,
    /"video_versions":\[[\s\S]*?"url":"([^"]+)"/i,
  ];

  for (const pattern of jsonPatterns) {
    const match = normalizedJsonLike.match(pattern);
    const resolved = normalizeExtractedMediaUrl(match?.[1] ?? null);
    if (resolved) return resolved;
  }

  return null;
};

const parseInstagramEmbedImage = (html: string) => {
  const normalizedJsonLike = html.replace(/\\"/g, '"');
  const imagePatterns = [/"display_url":"([^"]+)"/i, /"thumbnail_src":"([^"]+)"/i];

  for (const pattern of imagePatterns) {
    const match = normalizedJsonLike.match(pattern);
    const resolved = normalizeExtractedMediaUrl(match?.[1] ?? null);
    if (resolved) return resolved;
  }

  return null;
};

const fetchInstagramHtml = async (normalizedUrl: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(normalizedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: INSTAGRAM_FETCH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchInstagramMediaUrls = async (value: string | null | undefined) => {
  const normalized = normalizeInstagramUrl(value);
  if (!normalized) {
    return { videoUrl: null, thumbnailUrl: null };
  }

  let videoUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  const canonicalHtml = await fetchInstagramHtml(normalized);
  if (canonicalHtml) {
    videoUrl = parseOpenGraphVideo(canonicalHtml);
    thumbnailUrl = parseOpenGraphImage(canonicalHtml);
  }

  if (!videoUrl || !thumbnailUrl) {
    const embedUrl = buildInstagramEmbedUrl(normalized);
    if (embedUrl) {
      const embedHtml = await fetchInstagramHtml(embedUrl);
      if (embedHtml) {
        videoUrl = videoUrl ?? parseOpenGraphVideo(embedHtml);
        thumbnailUrl =
          thumbnailUrl ??
          parseOpenGraphImage(embedHtml) ??
          parseInstagramEmbedImage(embedHtml);
      }
    }
  }

  return { videoUrl, thumbnailUrl };
};

export const fetchInstagramThumbnailUrl = async (value: string | null | undefined) => {
  const media = await fetchInstagramMediaUrls(value);
  return media.thumbnailUrl;
};
