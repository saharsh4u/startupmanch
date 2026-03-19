import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS, ROUND_TABLE_TEXT_LIMITS } from "@/lib/roundtable/constants";
import { logRoundtableEvent, parseTags } from "@/lib/roundtable/server";
import { createRoundtableSession } from "@/lib/roundtable/create-session";
import { parseJsonSafely, requireCaptcha, requireRateLimit, resolveActor, withGuestCookie } from "@/lib/roundtable/api";

type CreateTopicPayload = {
  title?: string;
  description?: string;
  tags?: string[];
  turn_duration_sec?: number;
  display_name?: string;
  captcha_token?: string;
};

const normalizeText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await parseJsonSafely<CreateTopicPayload>(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const title = normalizeText(payload.title, ROUND_TABLE_TEXT_LIMITS.titleMax);
  const description = normalizeText(payload.description, ROUND_TABLE_TEXT_LIMITS.descriptionMax);
  const turnDurationSec = [60, 90, 120].includes(Number(payload.turn_duration_sec))
    ? Number(payload.turn_duration_sec)
    : 60;

  if (title.length < 4) {
    return NextResponse.json({ error: "Title must be at least 4 characters." }, { status: 400 });
  }

  const captchaValid = await requireCaptcha(request, payload.captcha_token ?? null);
  if (!captchaValid) {
    return NextResponse.json({ error: "Captcha validation failed." }, { status: 400 });
  }

  const actor = await resolveActor(request, payload.display_name ?? null);
  const rateAllowed = await requireRateLimit({
    request,
    actionType: "roundtable_topic_create",
    maxCount: ROUND_TABLE_LIMITS.createTopic.maxCount,
    windowMs: ROUND_TABLE_LIMITS.createTopic.windowMs,
    guestId: actor.guestId,
  });

  if (!rateAllowed) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const tags = parseTags(payload.tags);

  let created;
  try {
    created = await createRoundtableSession({
      actor,
      title,
      description,
      tags,
      turnDurationSec,
      visibility: "public",
    });
  } catch (creationError) {
    return NextResponse.json(
      { error: creationError instanceof Error ? creationError.message : "Unable to create topic." },
      { status: 500 }
    );
  }

  await logRoundtableEvent("roundtable_topic_created", {
    session_id: created.sessionId,
    topic_id: created.topicId,
    tags: created.tags,
    visibility: "public",
    turn_duration_sec: turnDurationSec,
    actor: actor.profileId ? "profile" : "guest",
  }, actor.profileId);

  const response = NextResponse.json(
    {
      ok: true,
      topic_id: created.topicId,
      session_id: created.sessionId,
      member_id: created.memberId,
      guest_id: actor.guestId,
    },
    { status: 201 }
  );

  return withGuestCookie(response, actor.guestId);
}
