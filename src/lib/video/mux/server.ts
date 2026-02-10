import crypto from "crypto";

type MuxConfig = {
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string;
};

type MuxAssetRequestInput = {
  inputUrl: string;
  passthroughPitchId: string;
};

type MuxPlaybackPolicy = "public" | "signed";

type MuxPlaybackId = {
  id: string;
  policy: MuxPlaybackPolicy;
};

type MuxAssetResponse = {
  data?: {
    id?: string;
    status?: string;
    passthrough?: string | null;
    playback_ids?: MuxPlaybackId[] | null;
  };
  error?: {
    type?: string;
    messages?: string[];
    message?: string;
  };
};

type ParsedMuxSignature = {
  timestamp: string;
  signatures: string[];
};

type MuxAsset = {
  assetId: string;
  playbackId: string | null;
  status: string | null;
};

const MUX_API_BASE = "https://api.mux.com/video/v1";
const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

const toBasicAuthToken = (tokenId: string, tokenSecret: string) =>
  Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const source = payload as Record<string, unknown>;
  const error = source.error as Record<string, unknown> | undefined;
  if (error?.message && typeof error.message === "string") return error.message;
  const messages = error?.messages;
  if (Array.isArray(messages) && typeof messages[0] === "string") return messages[0];
  if (typeof source.message === "string") return source.message;
  return fallback;
};

const getMuxConfig = (): MuxConfig => {
  const tokenId = process.env.MUX_TOKEN_ID?.trim();
  const tokenSecret = process.env.MUX_TOKEN_SECRET?.trim();
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET?.trim();

  if (!tokenId) throw new Error("MUX_TOKEN_ID is missing");
  if (!tokenSecret) throw new Error("MUX_TOKEN_SECRET is missing");
  if (!webhookSecret) throw new Error("MUX_WEBHOOK_SECRET is missing");

  return { tokenId, tokenSecret, webhookSecret };
};

const parseMuxSignature = (headerValue: string): ParsedMuxSignature | null => {
  if (!headerValue.trim().length) return null;

  const parts = headerValue.split(",").map((part) => part.trim());
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
};

const safeEqualHex = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const extractPlaybackId = (playbackIds: MuxPlaybackId[] | null | undefined): string | null => {
  if (!Array.isArray(playbackIds) || playbackIds.length === 0) return null;
  const publicPlayback = playbackIds.find((entry) => entry?.policy === "public" && entry?.id);
  if (publicPlayback?.id) return publicPlayback.id;
  const first = playbackIds.find((entry) => entry?.id);
  return first?.id ?? null;
};

const muxRequest = async <T>(path: string, options?: { method?: string; body?: unknown }) => {
  const config = getMuxConfig();
  const response = await fetch(`${MUX_API_BASE}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Basic ${toBasicAuthToken(config.tokenId, config.tokenSecret)}`,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const raw = await response.text();
  const payload = raw ? (JSON.parse(raw) as unknown) : {};

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, "Mux request failed"));
  }

  return payload as T;
};

export const createMuxAssetFromUrl = async ({
  inputUrl,
  passthroughPitchId,
}: MuxAssetRequestInput): Promise<MuxAsset> => {
  const normalizedUrl = inputUrl.trim();
  const normalizedPitchId = passthroughPitchId.trim();
  if (!normalizedUrl) throw new Error("inputUrl is required");
  if (!normalizedPitchId) throw new Error("passthroughPitchId is required");

  const payload = await muxRequest<MuxAssetResponse>("/assets", {
    method: "POST",
    body: {
      input: normalizedUrl,
      playback_policy: ["public"],
      mp4_support: "standard",
      passthrough: normalizedPitchId,
    },
  });

  const assetId = payload.data?.id?.trim();
  if (!assetId) {
    throw new Error(extractErrorMessage(payload, "Mux asset id missing"));
  }

  return {
    assetId,
    playbackId: extractPlaybackId(payload.data?.playback_ids),
    status: payload.data?.status ?? null,
  };
};

export const buildMuxPlaybackUrl = (playbackId: string | null | undefined) => {
  const normalized = playbackId?.trim();
  if (!normalized) return null;
  return `https://stream.mux.com/${normalized}/medium.mp4`;
};

export const verifyMuxWebhookSignature = (rawBody: string, headers: Headers) => {
  const signatureHeader = headers.get("mux-signature");
  if (!signatureHeader) return false;
  const parsed = parseMuxSignature(signatureHeader);
  if (!parsed) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_WEBHOOK_AGE_SECONDS) return false;

  const { webhookSecret } = getMuxConfig();
  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return parsed.signatures.some((signature) => safeEqualHex(signature, expectedSignature));
};
