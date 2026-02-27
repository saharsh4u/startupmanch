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

export const getGuestId = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(GUEST_ID_KEY);
};

export const ensureGuestId = () => {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(GUEST_ID_KEY);
  if (existing) {
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
