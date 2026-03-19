import { createHash, randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { RoundtableActor, RoundtableMemberRow } from "@/lib/roundtable/types";

const DEFAULT_IP = "0.0.0.0";
const MAX_NAME_LENGTH = 48;

export const readIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return DEFAULT_IP;
};

export const hashIp = (ip: string) => {
  const salt = process.env.ROUNDTABLE_RATE_LIMIT_SALT?.trim() || "roundtable-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
};

export const getGuestIdFromRequest = (request: Request) => {
  const actorHeader = request.headers.get("x-roundtable-actor-id")?.trim();
  if (actorHeader) return actorHeader;
  const headerValue = request.headers.get("x-roundtable-guest-id")?.trim();
  if (headerValue) return headerValue;
  return null;
};

export const normalizeDisplayName = (value: unknown) => {
  if (typeof value !== "string") return "Guest";
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed.length) return "Guest";
  return trimmed.slice(0, MAX_NAME_LENGTH);
};

export const parseTags = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  const tags = value
    .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 8);
  return Array.from(new Set(tags));
};

export const getRoundtableActor = async (request: Request, displayName?: string | null): Promise<RoundtableActor> => {
  const guestId = getGuestIdFromRequest(request) ?? randomUUID();
  return {
    profileId: null,
    guestId,
    displayName: displayName ? normalizeDisplayName(displayName) : null,
  };
};

export const getMemberForActor = async (sessionId: string, actor: RoundtableActor) => {
  let query = supabaseAdmin
    .from("roundtable_members")
    .select("id, session_id, seat_no, profile_id, guest_id, display_name, state, joined_at, left_at")
    .eq("session_id", sessionId)
    .eq("state", "joined");

  if (actor.profileId) {
    query = query.eq("profile_id", actor.profileId);
  } else if (actor.guestId) {
    query = query.eq("guest_id", actor.guestId);
  } else {
    return null;
  }

  const { data, error } = await query
    .order("joined_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  const members = ((data ?? []) as Omit<RoundtableMemberRow, "camera_state">[]).map((member) => ({
    ...member,
    camera_state: "off",
  })) as RoundtableMemberRow[];
  if (!members.length) return null;

  const [primary, ...duplicates] = members;
  if (duplicates.length) {
    const duplicateIds = duplicates.map((member) => member.id);
    await deleteRoundtableMembers(duplicateIds);
  }

  return primary;
};

export const getLatestJoinedMemberForActor = async (actor: RoundtableActor) => {
  let query = supabaseAdmin
    .from("roundtable_members")
    .select("id, session_id, seat_no, profile_id, guest_id, display_name, state, joined_at, left_at")
    .eq("state", "joined");

  if (actor.profileId) {
    query = query.eq("profile_id", actor.profileId);
  } else if (actor.guestId) {
    query = query.eq("guest_id", actor.guestId);
  } else {
    return null;
  }

  const { data, error } = await query.order("joined_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  return {
    ...(data as Omit<RoundtableMemberRow, "camera_state">),
    camera_state: "off",
  } satisfies RoundtableMemberRow;
};

export const logRoundtableEvent = async (
  eventType: string,
  metadata: Record<string, unknown>,
  userId?: string | null
) => {
  const { error } = await supabaseAdmin.from("analytics").insert({
    event_type: eventType,
    metadata,
    user_id: userId ?? null,
    pitch_id: null,
  });

  if (error) {
    console.error("roundtable analytics insert failed", error.message);
    return false;
  }

  return true;
};

export const nowIso = () => new Date().toISOString();

export const deleteRoundtableMembers = async (memberIds: string[]) => {
  const ids = Array.from(new Set(memberIds.filter(Boolean)));
  if (!ids.length) return;

  const { error } = await supabaseAdmin
    .from("roundtable_members")
    .delete()
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }
};

export const deleteSessionIfEmpty = async (sessionId: string) => {
  const { count, error: countError } = await supabaseAdmin
    .from("roundtable_members")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("state", "joined");

  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) > 0) return false;

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .select("topic_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session) return true;

  const topicId = String(session.topic_id);
  const { error: deleteSessionError } = await supabaseAdmin
    .from("roundtable_sessions")
    .delete()
    .eq("id", sessionId);

  if (deleteSessionError) {
    throw new Error(deleteSessionError.message);
  }

  if (topicId) {
    const { count: topicCount, error: topicCountError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topicId);

    if (topicCountError) {
      throw new Error(topicCountError.message);
    }

    if ((topicCount ?? 0) === 0) {
      const { error: topicDeleteError } = await supabaseAdmin
        .from("roundtable_topics")
        .delete()
        .eq("id", topicId);

      if (topicDeleteError) {
        throw new Error(topicDeleteError.message);
      }
    }
  }

  return true;
};

export const isLikelySpamText = (body: string) => {
  if (body.length > 600) return true;
  if (/(https?:\/\/|www\.)/i.test(body) && body.length < 32) return true;
  if (/(.)\1{8,}/.test(body)) return true;
  const lowered = body.toLowerCase();
  const blocked = ["viagra", "casino", "crypto pump", "loan offer", "free money"];
  return blocked.some((token) => lowered.includes(token));
};
