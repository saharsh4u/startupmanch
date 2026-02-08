import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { pitch_id, name, email, message, offer_amount } = await req.json();

    if (!pitch_id || !name || !email || !message || message.trim().length < 10) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("contact_requests").insert({
      pitch_id,
      name,
      email,
      message,
      offer_amount,
    });

    if (error) {
      console.error("contact insert error", error);
      return NextResponse.json({ error: "Failed to save request" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("contact handler error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
