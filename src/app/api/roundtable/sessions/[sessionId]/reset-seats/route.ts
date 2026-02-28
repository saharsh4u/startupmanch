import { NextResponse } from "next/server";
import { nowIso } from "@/lib/roundtable/server";
import { resolveActor, withGuestCookie } from "@/lib/roundtable/api";
import { reconcileSession } from "@/lib/roundtable/reconcile";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const actor = await resolveActor(request);
  const operator = await getOperatorAuthContext(request);

  try {
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("roundtable_sessions")
      .select("id, created_by_profile_id, created_by_guest_id")
      .eq("id", params.sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const isCreator =
      (actor.profileId && session.created_by_profile_id === actor.profileId) ||
      (actor.guestId && session.created_by_guest_id === actor.guestId);
    const isAdmin = Boolean(operator && requireRole(operator, ["admin"]));
    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: joinedRows, error: joinedRowsError } = await supabaseAdmin
      .from("roundtable_members")
      .select("id")
      .eq("session_id", params.sessionId)
      .eq("state", "joined");

    if (joinedRowsError) {
      return NextResponse.json({ error: joinedRowsError.message }, { status: 500 });
    }

    const joinedIds = (joinedRows ?? []).map((row) => String(row.id)).filter(Boolean);
    const now = nowIso();

    if (joinedIds.length) {
      const { error: clearMembersError } = await supabaseAdmin
        .from("roundtable_members")
        .update({ state: "left", left_at: now })
        .eq("session_id", params.sessionId)
        .eq("state", "joined");

      if (clearMembersError) {
        return NextResponse.json({ error: clearMembersError.message }, { status: 500 });
      }

      const { error: clearTurnsError } = await supabaseAdmin
        .from("roundtable_turns")
        .update({
          status: "skipped",
          submitted_at: now,
          auto_submitted: true,
          updated_at: now,
        })
        .eq("session_id", params.sessionId)
        .in("member_id", joinedIds)
        .in("status", ["queued", "active"]);

      if (clearTurnsError) {
        return NextResponse.json({ error: clearTurnsError.message }, { status: 500 });
      }
    }

    await supabaseAdmin
      .from("roundtable_sessions")
      .update({ updated_at: now })
      .eq("id", params.sessionId);

    await reconcileSession(params.sessionId);

    const response = NextResponse.json(
      {
        ok: true,
        seats_cleared: joinedIds.length,
      },
      { status: 200 }
    );
    return withGuestCookie(response, actor.guestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset seats.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
