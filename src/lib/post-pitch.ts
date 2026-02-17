export const POST_PITCH_QUERY_KEY = "post_pitch";
export const POST_PITCH_QUERY_VALUE = "1";
export const POST_PITCH_OPEN_EVENT = "startupmanch:open-post-pitch";
export const POST_PITCH_FALLBACK_HREF = `/?${POST_PITCH_QUERY_KEY}=${POST_PITCH_QUERY_VALUE}`;

export const openPostPitchFlow = () => {
  if (typeof window === "undefined") return;

  if (window.location.pathname === "/") {
    window.dispatchEvent(new CustomEvent(POST_PITCH_OPEN_EVENT));
    return;
  }

  window.location.assign(POST_PITCH_FALLBACK_HREF);
};
