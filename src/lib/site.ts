const DEFAULT_SITE_URL = "https://startupmanch.com";

export const resolveSiteUrl = () => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_URL;

  try {
    const parsed = new URL(configured);
    return parsed.origin.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
};

export const toAbsoluteSiteUrl = (path: string) => {
  const base = resolveSiteUrl();
  if (!path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
};
