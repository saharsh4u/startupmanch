"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RankingsModal from "@/components/RankingsModal";
import RankingsTableRows, { type RankingsRowItem } from "@/components/RankingsTableRows";

const WINDOW = "7d";
const HOME_LIMIT = 10;
const REFRESH_INTERVAL_MS = 60_000;

type RankingsResponse = {
  total?: number;
  data?: RankingsRowItem[];
};

const formatListings = (count: number) => `${new Intl.NumberFormat("en-US").format(count)} listings`;

export default function RankingsTable() {
  const [rows, setRows] = useState<RankingsRowItem[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadRows = useCallback(async () => {
    try {
      const response = await fetch(`/api/rankings?window=${WINDOW}&limit=${HOME_LIMIT}&offset=0`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load rankings.");
      }

      const payload = (await response.json()) as RankingsResponse;
      const nextRows = Array.isArray(payload.data) ? payload.data : [];

      setRows(nextRows);
      setTotal(Number(payload.total ?? nextRows[0]?.total_count ?? 0));
      setErrorText(null);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorText((error as Error).message || "Unable to refresh rankings.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      await loadRows();
      if (cancelled) return;
    };

    void load();

    const timer = window.setInterval(() => {
      void loadRows();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadRows]);

  const listingsText = useMemo(() => {
    const count = total || rows.length;
    return formatListings(count);
  }, [rows.length, total]);

  return (
    <section className="rankings-card">
      <div className="rankings-header">
        <div>
          <h3>Rank</h3>
          <span>{listingsText}</span>
        </div>
        <button type="button" className="view-all" onClick={() => setModalOpen(true)}>
          View All →
        </button>
      </div>
      <p className="rankings-microcopy">Compete for the top spot.</p>

      {status === "loading" && !rows.length ? <p className="rankings-state">Loading rankings...</p> : null}

      {status === "error" ? (
        <p className="rankings-state">
          {rows.length
            ? "Unable to refresh rankings. Showing last known rankings."
            : errorText ?? "Unable to load rankings."}
        </p>
      ) : null}

      {status !== "loading" && !rows.length ? <p className="rankings-state">No approved startups ranked yet.</p> : null}

      {rows.length ? <RankingsTableRows rows={rows} /> : null}

      <div className="rankings-footer">
        <button type="button" className="view-all ghost" onClick={() => setModalOpen(true)}>
          View All →
        </button>
      </div>

      <RankingsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
