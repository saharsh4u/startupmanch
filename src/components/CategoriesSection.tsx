"use client";

export const fallbackCategories = [
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
  "AI & ML",
];

type CategoriesSectionProps = {
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
};

export default function CategoriesSection({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoriesSectionProps) {
  const uniqueCategories = Array.from(
    new Set(
      categories
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

  const isSelected = (category: string | null) =>
    (selectedCategory ?? "").toLowerCase() === (category ?? "").toLowerCase();

  return (
    <section className="section-card categories">
      <div className="section-header center">
        <h3>Browse by category</h3>
      </div>
      <div className="category-grid">
        <button
          type="button"
          className={`category-chip${isSelected(null) ? " is-active" : ""}`}
          aria-pressed={isSelected(null)}
          onClick={() => onSelectCategory(null)}
        >
          All
        </button>
        {uniqueCategories.map((category) => (
          <button
            type="button"
            className={`category-chip${isSelected(category) ? " is-active" : ""}`}
            aria-pressed={isSelected(category)}
            onClick={() => onSelectCategory(category)}
            key={category}
          >
            {category}
          </button>
        ))}
      </div>
    </section>
  );
}
