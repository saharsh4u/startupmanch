"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureGuestId, getDisplayName } from "@/lib/roundtable/client-identity";
import styles from "@/components/roundtable/RoundtablePrivateRoomBootstrap.module.css";

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
    <main className={styles.shell}>
      <section className={styles.panel} aria-live="polite">
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span>StartupManch</span>
        </div>
        {!error ? <div className={styles.loader} aria-hidden /> : null}
        <h1>{error ? "Unable to create private room" : "Starting your private roundtable..."}</h1>
        <p>{error ?? "Creating a fresh private room for this tab."}</p>
        {error ? (
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              window.location.reload();
            }}
          >
            Retry
          </button>
        ) : null}
      </section>
    </main>
  );
}
