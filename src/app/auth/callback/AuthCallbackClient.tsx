"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

const sanitizeMessage = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);

  const code = useMemo(() => sanitizeMessage(searchParams.get("code")), [searchParams]);
  const providerError = useMemo(() => sanitizeMessage(searchParams.get("error")), [searchParams]);
  const providerErrorDescription = useMemo(
    () => sanitizeMessage(searchParams.get("error_description")),
    [searchParams]
  );

  useEffect(() => {
    const completeOAuth = async () => {
      if (!hasBrowserSupabaseEnv) {
        setStatus("error");
        setErrorText("Sign-in is temporarily unavailable. Missing Supabase browser env.");
        return;
      }

      if (providerError) {
        setStatus("error");
        setErrorText(providerErrorDescription ?? providerError);
        return;
      }

      if (!code) {
        setStatus("error");
        setErrorText("Missing OAuth code. Please try signing in again.");
        return;
      }

      const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus("error");
        setErrorText(error.message ?? "Unable to complete sign-in. Please try again.");
        return;
      }

      router.replace("/submit");
    };

    completeOAuth().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected authentication error.";
      setStatus("error");
      setErrorText(message);
    });
  }, [code, providerError, providerErrorDescription, router]);

  if (status === "loading") {
    return (
      <section className="submit-card">
        <div className="submit-card-header">
          <h2>Completing sign-in</h2>
          <span>Exchanging authorization code…</span>
        </div>
      </section>
    );
  }

  return (
    <section className="submit-card">
      <div className="submit-card-header">
        <h2>Sign-in failed</h2>
        <span>OAuth callback could not be completed.</span>
      </div>
      <p className="submit-error">{errorText ?? "Authentication failed."}</p>
      <div className="submit-actions">
        <Link href="/submit" className="ghost">
          Back to submit
        </Link>
      </div>
    </section>
  );
}
