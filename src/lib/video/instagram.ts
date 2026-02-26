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

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (!INSTAGRAM_HOSTS.has(host)) return null;

    const segments = url.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (segments.length < 2) return null;

    const kind = segments[0]?.toLowerCase();
    const code = segments[1];
    if (!kind || !code || !INSTAGRAM_PATH_PREFIXES.has(kind)) return null;

    return `https://www.instagram.com/${kind}/${code}/`;
  } catch {
    return null;
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
