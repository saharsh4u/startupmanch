"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { POST_PITCH_FALLBACK_HREF } from "@/lib/post-pitch";
import { hasBrowserSupabaseEnv, supabaseBrowser } from "@/lib/supabase/client";

const sanitizeMessage = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const sanitizeNextPath = (value: string | null) => {
  if (!value) return POST_PITCH_FALLBACK_HREF;
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (typeof window !== "undefined" && url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return POST_PITCH_FALLBACK_HREF;
  }

  return POST_PITCH_FALLBACK_HREF;
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
  const destination = useMemo(
    () => sanitizeNextPath(sanitizeMessage(searchParams.get("next"))),
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

      if (code) {
        const { error } = await supabaseBrowser.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus("error");
          setErrorText(error.message ?? "Unable to complete sign-in. Please try again.");
          return;
        }
        router.replace(destination);
        return;
      }

      const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
      const hashParams = new URLSearchParams(hash);
      const hashError = sanitizeMessage(hashParams.get("error"));
      const hashErrorDescription = sanitizeMessage(hashParams.get("error_description"));
      if (hashError) {
        setStatus("error");
        setErrorText(hashErrorDescription ?? hashError);
        return;
      }

      const accessToken = sanitizeMessage(hashParams.get("access_token"));
      const refreshToken = sanitizeMessage(hashParams.get("refresh_token"));
      if (accessToken && refreshToken) {
        const { error } = await supabaseBrowser.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setStatus("error");
          setErrorText(error.message ?? "Unable to complete sign-in. Please try again.");
          return;
        }
        router.replace(destination);
        return;
      }

      setStatus("error");
      setErrorText("Missing OAuth code. Please try signing in again.");
      return;
    };

    completeOAuth().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected authentication error.";
      setStatus("error");
      setErrorText(message);
    });
  }, [code, destination, providerError, providerErrorDescription, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) return;
    // Remove token fragments from URL once callback view has mounted.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);

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
        <Link href={POST_PITCH_FALLBACK_HREF} className="ghost">
          Back to post pitch
        </Link>
      </div>
    </section>
  );
}
