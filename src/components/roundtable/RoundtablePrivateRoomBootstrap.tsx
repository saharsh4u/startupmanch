"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdRailsScaffold from "@/components/AdRailsScaffold";
import TopNav from "@/components/TopNav";
import { ensureGuestId, getDisplayName } from "@/lib/roundtable/client-identity";

type PrivateRoomResponse = {
  ok?: boolean;
  error?: string;
  session_id?: string;
};

export default function RoundtablePrivateRoomBootstrap() {
  const router = useRouter();
  const actorId = useMemo(() => ensureGuestId(), []);
  const [error, setError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const response = await fetch("/api/roundtable/private-room", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-roundtable-actor-id": actorId,
          },
          body: JSON.stringify({
            display_name: getDisplayName(),
          }),
        });

        const payload = (await response.json()) as PrivateRoomResponse;
        if (!response.ok || !payload.session_id) {
          throw new Error(payload.error ?? "Unable to create your private roundtable.");
        }

        if (!cancelled) {
          router.replace(`/roundtable/${payload.session_id}?source=private-room`);
        }
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(
            bootstrapError instanceof Error
              ? bootstrapError.message
              : "Unable to create your private roundtable."
          );
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [actorId, router]);

  return (
    <AdRailsScaffold mainClassName="page roundtable-page inner-rails-page">
      <div className="roundtable-page-shell">
        <TopNav context="inner" showPostPitch />
        <div className="anchor-block">
          <div className="roundtable-shell">
            <section className="roundtable-panel">
              <h3>{error ? "Unable to create private room" : "Starting your private roundtable..."}</h3>
              <p>{error ?? "Creating a fresh private room for this tab."}</p>
              {error ? (
                <button
                  type="button"
                  className="roundtable-cta"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Retry
                </button>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AdRailsScaffold>
  );
}
