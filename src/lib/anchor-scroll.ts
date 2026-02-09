const MOBILE_QUERY = "(max-width: 768px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const NAV_GAP_PX = 12;

type ScrollAnchorOptions = {
  behavior?: ScrollBehavior;
  updateHash?: boolean;
};

const normalizeAnchorId = (anchorId: string) => anchorId.replace(/^#/, "").trim();

export const isMobileViewport = () =>
  typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;

const getNavOffset = () => {
  if (typeof document === "undefined") return 0;
  const nav = document.querySelector<HTMLElement>(".page-home .site-nav");
  const navHeight = nav?.getBoundingClientRect().height ?? 0;
  return navHeight + NAV_GAP_PX;
};

export const scrollToAnchorId = (
  anchorId: string,
  { behavior, updateHash = false }: ScrollAnchorOptions = {}
) => {
  if (typeof window === "undefined") return false;

  const normalizedId = normalizeAnchorId(anchorId);
  if (!normalizedId) return false;

  const target = document.getElementById(normalizedId);
  if (!target) return false;

  const targetTop = window.scrollY + target.getBoundingClientRect().top;
  const top = Math.max(0, targetTop - getNavOffset());
  const resolvedBehavior = behavior ?? (prefersReducedMotion() ? "auto" : "smooth");

  window.scrollTo({ top, behavior: resolvedBehavior });

  if (updateHash) {
    const url = `${window.location.pathname}${window.location.search}#${normalizedId}`;
    window.history.replaceState(window.history.state, "", url);
  }

  return true;
};
