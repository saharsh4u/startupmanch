"use client";

type Point = { date: string; amount: number };

type Props = {
  series: Point[];
  currency: string;
};

const formatAmount = (amt: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() || "USD", maximumFractionDigits: 0 }).format(amt);

export default function RevenueSparkline({ series, currency }: Props) {
  if (!series.length) {
    return <div className="sparkline-empty">No revenue yet</div>;
  }

  const width = 200;
  const height = 60;
  const max = Math.max(...series.map((p) => p.amount), 1);
  const min = Math.min(...series.map((p) => p.amount), 0);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(series.length - 1, 1);

  const points = series.map((p, idx) => {
    const x = idx * step;
    const y = height - ((p.amount - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  const last = series[series.length - 1];

  return (
    <div className="sparkline-card">
      <div className="sparkline-header">
        <p className="metric-label">Last 90 days</p>
        <p className="metric-value">{formatAmount(last.amount, currency)}</p>
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline-svg">
        <polyline points={points.join(" ")} fill="none" stroke="url(#spark-grad)" strokeWidth="2.5" />
        <defs>
          <linearGradient id="spark-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--spark-start)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--spark-end)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="sparkline-footer">
        <span className="metric-label">{new Date(series[0].date).toLocaleDateString()}</span>
        <span className="metric-label">{new Date(last.date).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
