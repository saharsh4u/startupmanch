import { NextResponse } from "next/server";
import { reconcileOpenSessions } from "@/lib/roundtable/reconcile";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type RoundtableSessionRow = {
  id: string;
  status: string;
  max_seats: number;
  created_at: string | null;
  updated_at: string | null;
  roundtable_topics: { title: string | null; description: string | null } | Array<{ title: string | null; description: string | null }> | null;
};

type RoundtableMemberRow = {
  id: string;
  session_id: string;
  seat_no: number;
  display_name: string | null;
  joined_at: string;
  profile_id: string | null;
  guest_id: string | null;
};

const parseLimit = (raw: string | null) => {
  const value = Number(raw ?? "120");
  if (!Number.isFinite(value)) return 120;
  return Math.min(Math.max(Math.floor(value), 1), 300);
};

const parseScope = (raw: string | null) => {
  const normalized = (raw ?? "all").trim().toLowerCase();
  if (normalized === "open") return "open";
  if (normalized === "closed") return "closed";
  return "all";
};

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const scope = parseScope(searchParams.get("scope"));

  try {
    await reconcileOpenSessions(20);
  } catch (error) {
    console.error("admin roundtable reconcile failed", error);
  }

  let sessionsQuery = supabaseAdmin
    .from("roundtable_sessions")
    .select("id, status, max_seats, created_at, updated_at, roundtable_topics(title, description)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (scope === "open") {
    sessionsQuery = sessionsQuery.in("status", ["lobby", "live"]);
  } else if (scope === "closed") {
    sessionsQuery = sessionsQuery.in("status", ["ended", "cancelled"]);
  }

  const { data: sessionsData, error: sessionsError } = await sessionsQuery;
  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const sessions = (sessionsData ?? []) as RoundtableSessionRow[];
  const sessionIds = sessions.map((session) => session.id);

  const membersBySessionId = new Map<string, RoundtableMemberRow[]>();
  if (sessionIds.length) {
    const { data: membersData, error: membersError } = await supabaseAdmin
      .from("roundtable_members")
      .select("id, session_id, seat_no, display_name, joined_at, profile_id, guest_id")
      .in("session_id", sessionIds)
      .eq("state", "joined")
      .order("seat_no", { ascending: true });

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    for (const row of (membersData ?? []) as RoundtableMemberRow[]) {
      const bucket = membersBySessionId.get(row.session_id) ?? [];
      bucket.push(row);
      membersBySessionId.set(row.session_id, bucket);
    }
  }

  return NextResponse.json({
    sessions: sessions.map((session) => {
      const topic = Array.isArray(session.roundtable_topics)
        ? session.roundtable_topics[0] ?? null
        : session.roundtable_topics;
      const joinedMembers = membersBySessionId.get(session.id) ?? [];
      return {
        session_id: session.id,
        status: session.status,
        max_seats: Number(session.max_seats) || 5,
        seats_taken: joinedMembers.length,
        created_at: session.created_at ?? null,
        updated_at: session.updated_at ?? null,
        topic_title: topic?.title ?? "Untitled topic",
        topic_description: topic?.description ?? null,
        joined_members: joinedMembers.map((member) => ({
          id: member.id,
          seat_no: Number(member.seat_no) || 0,
          display_name: member.display_name ?? "Guest",
          joined_at: member.joined_at,
          profile_id: member.profile_id ?? null,
          guest_id: member.guest_id ?? null,
        })),
      };
    }),
  });
}
