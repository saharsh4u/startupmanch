const categories = [
  "Food & Beverage",
  "Fashion",
  "Beauty & Personal Care",
  "Retail",
  "D2C Brands",
  "Home & Living",
  "Consumer Goods",
  "Healthcare",
  "Education",
  "Travel",
  "Logistics",
  "Agritech",
  "Manufacturing",
  "Fintech",
  "Media & Entertainment",
  "Sports & Fitness",
  "SaaS",
  "AI & ML"
];

export default function CategoriesSection() {
  return (
    <section className="section-card categories">
      <div className="section-header center">
        <h3>Browse by category</h3>
      </div>
      <div className="category-grid">
        {categories.map((category) => (
          <span className="category-chip" key={category}>
            {category}
          </span>
        ))}
      </div>
    </section>
  );
}
