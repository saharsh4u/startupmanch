const GUEST_ID_KEY = "rt_guest_id";
const DISPLAY_NAME_KEY = "rt_display_name";

const randomId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const setCookie = (name: string, value: string) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`;
};

const getCookieValue = (name: string) => {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return null;
  const value = cookie.slice(name.length + 1).trim();
  return value ? decodeURIComponent(value) : null;
};

export const getGuestId = () => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(GUEST_ID_KEY)?.trim() ?? "";
  if (stored.length) {
    setCookie("rt_guest_id", stored);
    return stored;
  }

  const fromCookie = getCookieValue("rt_guest_id")?.trim() ?? "";
  if (fromCookie.length) {
    window.localStorage.setItem(GUEST_ID_KEY, fromCookie);
    return fromCookie;
  }

  return null;
};

export const ensureGuestId = () => {
  if (typeof window === "undefined") return null;
  const existing = getGuestId();
  if (existing) {
    window.localStorage.setItem(GUEST_ID_KEY, existing);
    setCookie("rt_guest_id", existing);
    return existing;
  }

  const created = randomId();
  window.localStorage.setItem(GUEST_ID_KEY, created);
  setCookie("rt_guest_id", created);
  return created;
};

export const getDisplayName = () => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
};

export const setDisplayName = (value: string) => {
  if (typeof window === "undefined") return;
  const normalized = value.trim().slice(0, 48);
  if (!normalized.length) {
    window.localStorage.removeItem(DISPLAY_NAME_KEY);
    return;
  }
  window.localStorage.setItem(DISPLAY_NAME_KEY, normalized);
};
