import { createHmac, timingSafeEqual } from "crypto";

type InvitePayload = {
  session_id: string;
  seat_no: number | null;
  exp: number;
};

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const getSecret = () =>
  process.env.ROUNDTABLE_INVITE_SECRET?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  "startupmanch-roundtable-invite-secret";

const sign = (value: string) => createHmac("sha256", getSecret()).update(value).digest("base64url");

export const createRoundtableInviteToken = (params: {
  sessionId: string;
  seatNo?: number | null;
  expiresInMs?: number;
}) => {
  const payload: InvitePayload = {
    session_id: params.sessionId,
    seat_no: Number.isInteger(params.seatNo) ? Number(params.seatNo) : null,
    exp: Date.now() + (params.expiresInMs ?? 1000 * 60 * 60 * 24),
  };

  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
};

export const verifyRoundtableInviteToken = (token: string | null | undefined) => {
  const rawToken = token?.trim() ?? "";
  if (!rawToken) return null;

  const [encodedPayload, encodedSignature] = rawToken.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decode(encodedPayload)) as InvitePayload;
    if (!parsed?.session_id || !parsed?.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
