import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

  const { data: startup, error: startupError } = await supabaseAdmin
    .from("startups")
    .select("id,name")
    .eq("id", startupId)
    .single();

  if (startupError || !startup) {
    return NextResponse.json({ error: "Startup not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("startups")
    .delete()
    .eq("id", startupId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/roundtable");
  revalidatePath("/api/pitches");
  revalidatePath("/api/pitches/teasers");
  revalidatePath("/api/roundtable/lobby");

  return NextResponse.json({
    deleted: true,
    startup: {
      id: startup.id,
      name: startup.name ?? "Startup",
    },
  });
}
