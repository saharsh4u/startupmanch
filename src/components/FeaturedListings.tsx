type FeaturedItem = {
  name: string;
  category: string;
  stage: string;
  tag?: string;
};

type FeaturedListingsProps = {
  items: FeaturedItem[];
};

export default function FeaturedListings({ items }: FeaturedListingsProps) {
  return (
    <section className="featured">
      <div className="featured-header">
        <h3>Hot this week</h3>
        <span className="featured-link">View all →</span>
      </div>
      <div className="featured-grid">
        {items.map((item) => (
          <div className="listing-card" key={item.name}>
            <div className="listing-icon">{item.name[0]}</div>
            <div className="listing-title">
              <h4>{item.name}</h4>
              {item.tag && <span className="listing-tag">{item.tag}</span>}
            </div>
            <p className="listing-meta">{item.category}</p>
            <p className="listing-meta muted">{item.stage}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
