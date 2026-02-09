"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RankingsTableRows, { type RankingsRowItem } from "@/components/RankingsTableRows";

const WINDOW = "7d";
const LIMIT = 50;

type RankingsResponse = {
  total?: number;
  data?: RankingsRowItem[];
};

type RankingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const formatListings = (count: number) => `${new Intl.NumberFormat("en-US").format(count)} listings`;

export default function RankingsModal({ open, onClose }: RankingsModalProps) {
  const [rows, setRows] = useState<RankingsRowItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setStatus((prev) => (rows.length ? prev : "loading"));
    setErrorText(null);

    try {
      const response = await fetch(`/api/rankings?window=${WINDOW}&limit=${LIMIT}&offset=0`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load full rankings.");
      }

      const payload = (await response.json()) as RankingsResponse;
      const nextRows = Array.isArray(payload.data) ? payload.data : [];

      setRows(nextRows);
      setTotal(Number(payload.total ?? nextRows[0]?.total_count ?? 0));
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorText((error as Error).message || "Unable to load rankings.");
    }
  }, [rows.length]);

  useEffect(() => {
    if (!open) return;
    void loadRows();
  }, [open, loadRows]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  const listingLabel = useMemo(() => {
    const count = total || rows.length;
    return formatListings(count);
  }, [rows.length, total]);

  if (!open) return null;

  return (
    <div
      className="rankings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rankings-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="rankings-modal-panel">
        <div className="rankings-modal-header">
          <div>
            <h3 id="rankings-modal-title">All Startup Rankings</h3>
            <span>{listingLabel}</span>
          </div>
          <button type="button" className="rankings-modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="rankings-modal-body">
          {status === "loading" && !rows.length ? (
            <p className="rankings-state">Loading rankings...</p>
          ) : null}

          {status === "error" ? (
            <p className="rankings-state">
              {rows.length
                ? "Unable to refresh rankings. Showing last known rankings."
                : errorText ?? "Unable to load rankings."}
            </p>
          ) : null}

          {status !== "loading" && !rows.length ? (
            <p className="rankings-state">No approved startups ranked yet.</p>
          ) : null}

          {rows.length ? <RankingsTableRows rows={rows} tableClassName="rankings-table--modal" /> : null}
        </div>
      </div>
    </div>
  );
}
