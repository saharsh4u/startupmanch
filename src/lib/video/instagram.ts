const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const INSTAGRAM_PATH_PREFIXES = new Set(["reel", "p", "tv"]);

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

const parseOpenGraphImage = (html: string) => {
  const matchByPropertyFirst = html.match(
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  if (matchByPropertyFirst?.[1]) {
    return decodeHtmlEntities(matchByPropertyFirst[1]);
  }

  const matchByContentFirst = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["'][^>]*>/i
  );
  if (matchByContentFirst?.[1]) {
    return decodeHtmlEntities(matchByContentFirst[1]);
  }

  return null;
};

export const fetchInstagramThumbnailUrl = async (value: string | null | undefined) => {
  const normalized = normalizeInstagramUrl(value);
  if (!normalized) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(normalized, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const ogImage = parseOpenGraphImage(html);
    if (!ogImage || !isExternalMediaUrl(ogImage)) return null;
    return ogImage;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
