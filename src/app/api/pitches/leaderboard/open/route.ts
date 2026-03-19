import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  PITCH_OPEN_EVENT_TYPE,
  ROUNDTABLE_VIDEO_RAIL_SOURCE,
} from "@/lib/pitches/leaderboard";

export const runtime = "nodejs";

type OpenPayload = {
  pitch_id?: unknown;
  session_id?: unknown;
  participant_id?: unknown;
  source?: unknown;
};

const asTrimmedString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const isMissingAnalyticsTable = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("public.analytics");

const isMissingRoundtableAuditTable = (message: string | null | undefined) =>
  (message ?? "").toLowerCase().includes("public.roundtable_action_audit");

export async function POST(request: NextRequest) {
  let payload: OpenPayload;

  try {
    payload = (await request.json()) as OpenPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const pitchId = asTrimmedString(payload.pitch_id, 120);
  const sessionId = asTrimmedString(payload.session_id, 120);
  const participantId = asTrimmedString(payload.participant_id, 120);
  const source = asTrimmedString(payload.source, 80) ?? ROUNDTABLE_VIDEO_RAIL_SOURCE;

  if (!pitchId) {
    return NextResponse.json({ error: "pitch_id is required." }, { status: 400 });
  }

  const { data: pitchRow, error: pitchError } = await supabaseAdmin
    .from("pitches")
    .select("id, startup_id, status, type")
    .eq("id", pitchId)
    .maybeSingle();

  if (pitchError) {
    return NextResponse.json({ error: pitchError.message }, { status: 500 });
  }

  if (!pitchRow || pitchRow.status !== "approved" || pitchRow.type !== "elevator") {
    return NextResponse.json({ error: "Pitch not found." }, { status: 404 });
  }

  const authContext = await getAuthContext(request);
  const { error: insertError } = await supabaseAdmin.from("analytics").insert({
    event_type: PITCH_OPEN_EVENT_TYPE,
    pitch_id: pitchId,
    user_id: authContext?.userId ?? null,
    metadata: {
      source,
      session_id: sessionId,
      participant_id: participantId,
    },
  });

  if (insertError) {
    if (!isMissingAnalyticsTable(insertError.message)) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: fallbackInsertError } = await supabaseAdmin.from("roundtable_action_audit").insert({
      session_id: sessionId,
      guest_id: participantId,
      ip_hash: pitchId,
      action_type: PITCH_OPEN_EVENT_TYPE,
    });

    if (fallbackInsertError) {
      if (!isMissingRoundtableAuditTable(fallbackInsertError.message)) {
        return NextResponse.json({ error: fallbackInsertError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
