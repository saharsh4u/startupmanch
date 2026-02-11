import { formatDualAmount, type DualAmount } from "@/lib/startups/profile";

type StartupMetricsRowProps = {
  rank: number | null;
  rankTotal: number;
  watchersCount: number;
  allTimeRevenueDual: DualAmount;
  mrrDual: DualAmount;
  activeSubscriptions: number | null;
  revenueSource: "verified" | "self_reported" | "none";
};

export default function StartupMetricsRow({
  rank,
  rankTotal,
  watchersCount,
  allTimeRevenueDual,
  mrrDual,
  activeSubscriptions,
  revenueSource,
}: StartupMetricsRowProps) {
  return (
    <section className="startup-metrics-row" aria-label="Startup metrics">
      <article className="startup-metric-card">
        <p className="metric-label">All-time revenue</p>
        <p className="metric-value">{formatDualAmount(allTimeRevenueDual)}</p>
        <p className="metric-note">Source: {revenueSource.replace("_", " ")}</p>
      </article>

      <article className="startup-metric-card">
        <p className="metric-label">MRR</p>
        <p className="metric-value">{formatDualAmount(mrrDual)}</p>
        <p className="metric-note">Dual currency always shown</p>
      </article>

      <article className="startup-metric-card">
        <p className="metric-label">All-time rank</p>
        <p className="metric-value">
          {rank === null ? "-" : `#${rank}`}
          {rankTotal > 0 ? <span className="metric-faint"> / {rankTotal}</span> : null}
        </p>
        <p className="metric-note">Community ranking</p>
      </article>

      <article className="startup-metric-card">
        <p className="metric-label">Watchers / subscribers</p>
        <p className="metric-value">
          {watchersCount}
          {activeSubscriptions !== null ? (
            <span className="metric-faint"> / {activeSubscriptions}</span>
          ) : null}
        </p>
        <p className="metric-note">Watchers shown first</p>
      </article>
    </section>
  );
}
