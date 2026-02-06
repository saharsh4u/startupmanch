export type RankRow = {
  rank: number;
  name: string;
  industry: string;
  revenue: string;
  multiple: string;
  growth: string;
  featured?: boolean;
};

export const rankingRows: RankRow[] = [
  {
    rank: 1,
    name: "Zepto",
    industry: "Quick Commerce",
    revenue: "$40M",
    multiple: "1.3x",
    growth: "270%",
    featured: true,
  },
  {
    rank: 2,
    name: "Lucidity",
    industry: "Cloud Data",
    revenue: "$4.3M",
    multiple: "5.9x",
    growth: "600%",
    featured: true,
  },
  {
    rank: 3,
    name: "Swish",
    industry: "Food Delivery",
    revenue: "$180K",
    multiple: "2.2x",
    growth: "250%",
    featured: true,
  },
  {
    rank: 4,
    name: "Weekday",
    industry: "HR Tech",
    revenue: "$127K",
    multiple: "3.5x",
    growth: "310%",
  },
  {
    rank: 5,
    name: "Jar",
    industry: "Fintech",
    revenue: "$8.9K",
    multiple: "2.6x",
    growth: "$275K",
  },
  {
    rank: 6,
    name: "Convin",
    industry: "AI Customer Intelligence",
    revenue: "$24K",
    multiple: "3.1x",
    growth: "15%",
  },
  {
    rank: 7,
    name: "Bhanzu",
    industry: "Education",
    revenue: "$250K",
    multiple: "5.5x",
    growth: "120%",
    featured: true,
  },
  {
    rank: 8,
    name: "Refyne India",
    industry: "Fintech",
    revenue: "$250K",
    multiple: "5.5x",
    growth: "120%",
  },
  {
    rank: 9,
    name: "EMotorad",
    industry: "EV Mobility",
    revenue: "$98K",
    multiple: "2.9x",
    growth: "42%",
  },
  {
    rank: 10,
    name: "GoKwik",
    industry: "Ecommerce Enablement",
    revenue: "$84K",
    multiple: "4.1x",
    growth: "88%",
  },
];
