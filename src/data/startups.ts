export type Startup = {
  name: string;
  tagline: string;
  founder: string;
  mrr: string;
  growth: string;
  trend: "up" | "down";
};

export const startups: Startup[] = [
  {
    name: "MasalaMile",
    tagline: "Cloud kitchen brand",
    founder: "Riya Malhotra",
    mrr: "$38k",
    growth: "6%",
    trend: "up"
  },
  {
    name: "LoomWear",
    tagline: "D2C apparel label",
    founder: "Amit Verma",
    mrr: "$120k",
    growth: "3%",
    trend: "up"
  },
  {
    name: "GlowSutra",
    tagline: "Clean beauty line",
    founder: "Neha Singh",
    mrr: "$22k",
    growth: "4%",
    trend: "down"
  },
  {
    name: "TiffinLoop",
    tagline: "Office meal plans",
    founder: "Kunal Shah",
    mrr: "$9k",
    growth: "2%",
    trend: "up"
  },
  {
    name: "UrbanKada",
    tagline: "Home & living D2C",
    founder: "Sana Noor",
    mrr: "$64k",
    growth: "8%",
    trend: "up"
  },
  {
    name: "Farm2Fork",
    tagline: "Fresh produce supply",
    founder: "Arjun Mehta",
    mrr: "$210k",
    growth: "5%",
    trend: "up"
  },
  {
    name: "EduPath",
    tagline: "K-12 learning kits",
    founder: "Priya Nair",
    mrr: "$27k",
    growth: "1%",
    trend: "down"
  },
  {
    name: "FastFleet",
    tagline: "Hyperlocal delivery",
    founder: "Rohan Kapoor",
    mrr: "$14k",
    growth: "4%",
    trend: "up"
  },
  {
    name: "HealthBridge",
    tagline: "Primary care chain",
    founder: "Meera Jain",
    mrr: "$96k",
    growth: "6%",
    trend: "up"
  },
  {
    name: "CraftStreet",
    tagline: "Local artisan marketplace",
    founder: "Dev Patel",
    mrr: "$58k",
    growth: "2%",
    trend: "down"
  }
];
