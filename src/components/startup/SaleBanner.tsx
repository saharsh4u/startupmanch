import { formatDualAmount, type DualAmount } from "@/lib/startups/profile";

type SaleBannerProps = {
  isForSale: boolean;
  askingPriceDual: DualAmount;
};

export default function SaleBanner({ isForSale, askingPriceDual }: SaleBannerProps) {
  if (!isForSale) return null;

  return (
    <section className="startup-sale-banner" aria-label="Startup sale banner">
      <p className="startup-sale-kicker">Open to acquisition</p>
      <h2>This startup is currently for sale</h2>
      <p className="startup-sale-price">Asking price: {formatDualAmount(askingPriceDual)}</p>
    </section>
  );
}
