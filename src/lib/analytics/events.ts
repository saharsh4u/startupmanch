export type AnalyticsEventName =
  | "post_pitch_open"
  | "post_pitch_submit_attempt"
  | "post_pitch_submit_success"
  | "pitch_upvote"
  | "pitch_downvote"
  | "pitch_comments_open"
  | "founder_contact_submit"
  | "sponsor_checkout_start"
  | "sponsor_onboarding_submit_success"
  | "lead_submit_success"
  | "lead_submit_error";

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export const trackEvent = (name: AnalyticsEventName, params: AnalyticsParams = {}) => {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
};
