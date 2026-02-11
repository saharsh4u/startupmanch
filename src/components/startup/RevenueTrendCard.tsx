import RevenueSparkline from "@/components/RevenueSparkline";
import { formatRelativeDate } from "@/lib/startups/profile";

type RevenueTrendCardProps = {
  series: Array<{ date: string; amount: number }>;
  currency: "INR" | "USD";
  provider: "stripe" | "razorpay" | null;
  status: "active" | "error" | "revoked" | "missing";
  lastUpdated: string | null;
  fxRateLabel: string;
};

export default function RevenueTrendCard({
  series,
  currency,
  provider,
  status,
  lastUpdated,
  fxRateLabel,
}: RevenueTrendCardProps) {
  return (
    <section className="startup-revenue-card" aria-label="Revenue trend">
      <div className="startup-revenue-head">
        <div>
          <p className="metric-label">Revenue trend</p>
          <h3>Last 90 days</h3>
        </div>
        <div className="startup-revenue-meta">
          <span>{provider ? `Provider: ${provider}` : "Provider: none"}</span>
          <span>Status: {status}</span>
          <span>Updated: {formatRelativeDate(lastUpdated)}</span>
        </div>
      </div>

      <RevenueSparkline series={series} currency={currency} />

      <p className="metric-note startup-fx-note">FX snapshot: {fxRateLabel}</p>
    </section>
  );
}
