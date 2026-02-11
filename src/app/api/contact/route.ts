import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { pitch_id, startup_id, name, email, message, offer_amount } = await req.json();

    const safePitchId =
      typeof pitch_id === "string" && pitch_id.trim().length ? pitch_id.trim() : null;
    let safeStartupId =
      typeof startup_id === "string" && startup_id.trim().length ? startup_id.trim() : null;
    const safeName = typeof name === "string" ? name.trim() : "";
    const safeEmail = typeof email === "string" ? email.trim() : "";
    const safeMessage = typeof message === "string" ? message.trim() : "";

    if ((!safePitchId && !safeStartupId) || !safeName || !safeEmail || safeMessage.length < 10) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (safePitchId) {
      const { data: pitchRow, error: pitchError } = await supabaseAdmin
        .from("pitches")
        .select("id,startup_id,status")
        .eq("id", safePitchId)
        .maybeSingle();

      if (pitchError) {
        return NextResponse.json({ error: "Invalid pitch_id" }, { status: 400 });
      }
      if (!pitchRow || pitchRow.status !== "approved") {
        return NextResponse.json({ error: "Pitch not found" }, { status: 404 });
      }

      if (safeStartupId && safeStartupId !== pitchRow.startup_id) {
        return NextResponse.json(
          { error: "pitch_id does not belong to startup_id" },
          { status: 400 }
        );
      }

      safeStartupId = safeStartupId ?? pitchRow.startup_id;
    }

    if (safeStartupId) {
      const { data: startupRow, error: startupError } = await supabaseAdmin
        .from("startups")
        .select("id,status")
        .eq("id", safeStartupId)
        .maybeSingle();
      if (startupError) {
        return NextResponse.json({ error: "Invalid startup_id" }, { status: 400 });
      }
      if (!startupRow || startupRow.status !== "approved") {
        return NextResponse.json({ error: "Startup not found" }, { status: 404 });
      }
    }

    const parsedOffer =
      offer_amount === null || offer_amount === undefined || offer_amount === ""
        ? null
        : Number(offer_amount);
    if (parsedOffer !== null && !Number.isFinite(parsedOffer)) {
      return NextResponse.json({ error: "Invalid offer_amount" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("contact_requests").insert({
      pitch_id: safePitchId,
      startup_id: safeStartupId,
      name: safeName,
      email: safeEmail,
      message: safeMessage,
      offer_amount: parsedOffer,
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
