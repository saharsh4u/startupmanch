import { NextResponse } from "next/server";
import { ROUND_TABLE_LIMITS, ROUND_TABLE_TEXT_LIMITS } from "@/lib/roundtable/constants";
import { logRoundtableEvent, parseTags } from "@/lib/roundtable/server";
import { parseJsonSafely, requireCaptcha, requireRateLimit, resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { supabaseAdmin } from "@/lib/supabase/server";

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

  const { data: topic, error: topicError } = await supabaseAdmin
    .from("roundtable_topics")
    .insert({
      title,
      description: description || null,
      tags,
      created_by_profile_id: actor.profileId,
      created_by_guest_id: actor.guestId,
    })
    .select("id")
    .single();

  if (topicError || !topic?.id) {
    return NextResponse.json({ error: topicError?.message ?? "Unable to create topic." }, { status: 500 });
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .insert({
      topic_id: topic.id,
      status: "lobby",
      max_seats: 5,
      turn_duration_sec: turnDurationSec,
      created_by_profile_id: actor.profileId,
      created_by_guest_id: actor.guestId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session?.id) {
    return NextResponse.json({ error: sessionError?.message ?? "Unable to create session." }, { status: 500 });
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from("roundtable_members")
    .insert({
      session_id: session.id,
      seat_no: 1,
      profile_id: actor.profileId,
      guest_id: actor.guestId,
      display_name: actor.displayName,
      state: "joined",
    })
    .select("id")
    .single();

  if (memberError || !member?.id) {
    return NextResponse.json({ error: memberError?.message ?? "Unable to reserve creator seat." }, { status: 500 });
  }

  await supabaseAdmin
    .from("roundtable_scores")
    .upsert(
      {
        session_id: session.id,
        member_id: member.id,
        points: 0,
        approved_turns: 0,
        upvotes_received: 0,
        useful_marks: 0,
        violations: 0,
      },
      { onConflict: "session_id,member_id" }
    );

  await logRoundtableEvent("roundtable_topic_created", {
    session_id: session.id,
    topic_id: topic.id,
    tags,
    turn_duration_sec: turnDurationSec,
    actor: actor.profileId ? "profile" : "guest",
  }, actor.profileId);

  const response = NextResponse.json(
    {
      ok: true,
      topic_id: topic.id,
      session_id: session.id,
      member_id: member.id,
      guest_id: actor.guestId,
    },
    { status: 201 }
  );

  return withGuestCookie(response, actor.guestId);
}
