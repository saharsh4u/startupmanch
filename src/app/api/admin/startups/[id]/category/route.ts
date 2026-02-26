import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getOperatorAuthContext, requireRole } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const authContext = await getOperatorAuthContext(request);
  if (!authContext || !requireRole(authContext, ["admin"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startupId = params.id?.trim();
  if (!startupId) {
    return NextResponse.json({ error: "Startup id is required" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const categoryInput =
    payload && typeof payload.category === "string" ? payload.category.trim().slice(0, 80) : "";
  if (!categoryInput.length) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }

  const { data: startup, error: lookupError } = await supabaseAdmin
    .from("startups")
    .select("id,name")
    .eq("id", startupId)
    .single();

  if (lookupError || !startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("startups")
    .update({ category: categoryInput })
    .eq("id", startupId)
    .select("id,name,category")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Unable to update category." }, { status: 500 });
  }

  return NextResponse.json({
    updated: true,
    startup: {
      id: updated.id,
      name: updated.name ?? "Startup",
      category: updated.category ?? categoryInput,
    },
  });
}
