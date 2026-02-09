import type { MarketplaceCard } from "@/data/marketplace";

type CardsSectionProps = {
  title: string;
  items: MarketplaceCard[];
};

export default function CardsSection({ title, items }: CardsSectionProps) {
  return (
    <section className="section-card cards-section">
      <div className="section-header">
        <h3>{title}</h3>
        <span className="section-link">View all →</span>
      </div>
      <div className="mini-card-grid">
        {items.map((card) => (
          <div className="mini-card" key={card.name}>
            <div className="mini-card-top">
              <span className="mini-tag">{card.tag ?? "FOR SALE"}</span>
            </div>
            <div className="mini-card-main">
              <div className="mini-logo">
                {card.name
                  .split(" ")
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")}
              </div>
              <div>
                <h4>{card.name}</h4>
                <p className="mini-line">{card.category}</p>
              </div>
            </div>
            <div className="mini-metric-row">
              <div>
                <span>Revenue</span>
                <strong>{card.revenue}</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{card.price}</strong>
              </div>
              <div>
                <span>Multiple</span>
                <strong>{card.multiple}</strong>
              </div>
            </div>
            <button type="button" className="claim-btn">
              Claim profile
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
