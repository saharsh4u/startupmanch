const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const verifyCaptchaToken = async (
  token: string,
  remoteIp: string | null
): Promise<boolean> => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // For environments without captcha config, keep development flows unblocked.
    return true;
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) return false;

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", trimmedToken);
  if (remoteIp) {
    form.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });

    if (!response.ok) return false;

    const payload = (await response.json()) as { success?: boolean };
    return Boolean(payload.success);
  } catch {
    return false;
  }
};
