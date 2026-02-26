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

export const normalizeInstagramUrl = (value: string | null | undefined) => {
  const normalized = trimToNull(value);
  if (!normalized) return null;

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
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (!INSTAGRAM_HOSTS.has(host)) return null;

    const segments = url.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    return parseSegments(segments);
  } catch {
    const stripped = normalized
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
