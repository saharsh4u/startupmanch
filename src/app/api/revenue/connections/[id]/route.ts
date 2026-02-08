import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await getAuthContext(_request);
    if (!auth || !requireRole(auth, ["founder", "admin"])) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = params;
    const { data: row } = await supabaseAdmin
      .from("revenue_connections")
      .select("id, startup_id")
      .eq("id", id)
      .single();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: startupRow } = await supabaseAdmin
      .from("startups")
      .select("founder_id")
      .eq("id", row.startup_id)
      .single();
    if (startupRow?.founder_id !== auth.userId && !requireRole(auth, ["admin"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from("revenue_connections").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("revenue connection delete error", err);
    return NextResponse.json({ error: err.message ?? "Unable to delete connection" }, { status: 500 });
  }
}
