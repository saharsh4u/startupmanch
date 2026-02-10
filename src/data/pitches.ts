export type Pitch = {
  id: string;
  name: string;
  tagline: string;
  category: string;
  city: string;
  ask: string;
  equity: string;
  valuation: string;
  poster: string;
  isD2C?: boolean;
};

export const pitches: Pitch[] = [
  {
    id: "masala-mile",
    name: "MasalaMile",
    tagline: "Cloud kitchen for office teams",
    category: "Food & Beverage",
    city: "Bengaluru",
    ask: "₹50L",
    equity: "2%",
    valuation: "₹25 Cr",
    poster: "/pitches/pitch-01.svg?v=2",
    isD2C: true
  },
  {
    id: "loomwear",
    name: "LoomWear",
    tagline: "Ethnic drops, on-demand",
    category: "Fashion",
    city: "Jaipur",
    ask: "₹80L",
    equity: "3%",
    valuation: "₹26.7 Cr",
    poster: "/pitches/pitch-02.svg?v=2",
    isD2C: true
  },
  {
    id: "health-bridge",
    name: "HealthBridge",
    tagline: "Clinics for tier-2 India",
    category: "Healthcare",
    city: "Lucknow",
    ask: "₹1.2 Cr",
    equity: "4%",
    valuation: "₹30 Cr",
    poster: "/pitches/pitch-03.svg?v=2"
  },
  {
    id: "agri-wiz",
    name: "AgriWiz",
    tagline: "Nano-drip tech that triples yields",
    category: "AgriTech",
    city: "Nashik",
    ask: "₹65L",
    equity: "3%",
    valuation: "₹21.6 Cr",
    poster: "/pitches/pitch-04.svg?v=2"
  }
];
