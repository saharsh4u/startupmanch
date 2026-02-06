export type BrandEntry = {
  name: string;
  revenue: string;
  sector: string;
  baseCts: number;
  logo?: string;
};

const companySeed = [
  {
    name: "Reliance Industries Ltd",
    revenue: "10517B",
    sector: "Energy / Retail / Telecom",
    logo: "RIL"
  },
  {
    name: "Life Insurance Corporation of India (LIC)",
    revenue: "9743B",
    sector: "Insurance",
    logo: "LIC"
  },
  {
    name: "Indian Oil Corporation Ltd",
    revenue: "8109B",
    sector: "Oil & Gas",
    logo: "IOC"
  },
  {
    name: "State Bank of India (SBI)",
    revenue: "8357B (approx)",
    sector: "Banking",
    logo: "SBI"
  },
  {
    name: "HDFC Bank",
    revenue: "6054B",
    sector: "Banking",
    logo: "HDFC"
  },
  {
    name: "Tata Motors",
    revenue: "4459B",
    sector: "Automotive",
    logo: "TML"
  },
  {
    name: "Bharat Petroleum Corporation Ltd",
    revenue: "4429B",
    sector: "Oil & Gas",
    logo: "BPCL"
  },
  {
    name: "Hindustan Petroleum Corp Ltd",
    revenue: "4361B",
    sector: "Oil & Gas",
    logo: "HPCL"
  },
  {
    name: "Coal India Ltd",
    revenue: "1323B",
    sector: "Mining / Energy",
    logo: "CIL"
  },
  {
    name: "HCL Technologies",
    revenue: "1315B",
    sector: "IT Services",
    logo: "HCL"
  },
  {
    name: "SBI Life Insurance",
    revenue: "1292B",
    sector: "Insurance",
    logo: "SBIL"
  },
  {
    name: "Samvardhana Motherson Group",
    revenue: "1233B",
    sector: "Auto Components",
    logo: "SMG"
  },
  {
    name: "Redington India",
    revenue: "1119B",
    sector: "Distribution / IT",
    logo: "RED"
  },
  {
    name: "Steel Authority of India Ltd",
    revenue: "1116B",
    sector: "Steel",
    logo: "SAIL"
  },
  {
    name: "Adani Enterprises",
    revenue: "1014B",
    sector: "Conglomerate",
    logo: "AD"
  },
  {
    name: "Axis Bank",
    revenue: "930B",
    sector: "Banking",
    logo: "AXIS"
  },
  {
    name: "UltraTech Cement",
    revenue: "848B",
    sector: "Cement",
    logo: "UTC"
  },
  {
    name: "InterGlobe Aviation (IndiGo)",
    revenue: "845B",
    sector: "Aviation",
    logo: "IGO"
  },
  {
    name: "ITC Ltd",
    revenue: "844B",
    sector: "Conglomerate",
    logo: "ITC"
  },
  {
    name: "Kotak Mahindra Bank",
    revenue: "832B",
    sector: "Banking",
    logo: "KOT"
  },
  {
    name: "Canara Bank",
    revenue: "787B",
    sector: "Banking",
    logo: "CB"
  },
  {
    name: "Bank of Baroda",
    revenue: "760B",
    sector: "Banking",
    logo: "BOB"
  },
  {
    name: "Hyundai Motor India",
    revenue: "724B",
    sector: "Automotive",
    logo: "HM"
  },
  {
    name: "ICICI Prudential Life (ICICI Pru Life)",
    revenue: "712B",
    sector: "Insurance",
    logo: "ICICI"
  },
  {
    name: "DMart (Avenue Supermarts)",
    revenue: "689B",
    sector: "Retail",
    logo: "DM"
  },
  {
    name: "Tata Power",
    revenue: "687B",
    sector: "Energy",
    logo: "TP"
  },
  {
    name: "Hindustan Unilever Ltd (HUL)",
    revenue: "679B",
    sector: "Consumer Goods",
    logo: "HUL"
  },
  {
    name: "Titan Company",
    revenue: "676B",
    sector: "Consumer Goods",
    logo: "TIT"
  },
  {
    name: "Punjab National Bank",
    revenue: "664B",
    sector: "Banking",
    logo: "PNB"
  },
  {
    name: "Union Bank of India",
    revenue: "621B",
    sector: "Banking",
    logo: "UBI"
  },
  {
    name: "Chennai Petroleum",
    revenue: "613B",
    sector: "Oil & Gas",
    logo: "CP"
  },
  {
    name: "Tech Mahindra",
    revenue: "574B",
    sector: "IT Services",
    logo: "TECH"
  },
  {
    name: "Sun Pharmaceutical",
    revenue: "574B",
    sector: "Pharma",
    logo: "SUN"
  },
  {
    name: "General Insurance Corporation of India",
    revenue: "566B",
    sector: "Insurance",
    logo: "GIC"
  },
  {
    name: "Bajaj Auto",
    revenue: "559B",
    sector: "Automotive",
    logo: "BA"
  },
  {
    name: "Ashok Leyland",
    revenue: "539B",
    sector: "Automotive",
    logo: "AL"
  },
  {
    name: "New India Assurance",
    revenue: "509B",
    sector: "Insurance",
    logo: "NIA"
  },
  {
    name: "Petronet LNG",
    revenue: "500B",
    sector: "Energy",
    logo: "PNG"
  },
  {
    name: "UPL Ltd",
    revenue: "499B",
    sector: "Agriculture Chemicals",
    logo: "UPL"
  },
  {
    name: "Bajaj Finance",
    revenue: "492B",
    sector: "Financial Services",
    logo: "BF"
  },
  {
    name: "Dixon Technologies",
    revenue: "483B",
    sector: "Electronics",
    logo: "DX"
  },
  {
    name: "Powergrid Corporation of India",
    revenue: "476B",
    sector: "Energy",
    logo: "PGC"
  },
  {
    name: "Aditya Birla Capital",
    revenue: "473B",
    sector: "Financial Services",
    logo: "ABC"
  },
  {
    name: "Vodafone Idea",
    revenue: "469B",
    sector: "Telecom",
    logo: "VI"
  },
  {
    name: "Max Financial Services",
    revenue: "466B",
    sector: "Financial Services",
    logo: "MAX"
  },
  {
    name: "Power Finance Corp",
    revenue: "462B",
    sector: "Financial Services",
    logo: "PFC"
  },
  {
    name: "Hero MotoCorp",
    revenue: "444B",
    sector: "Automotive",
    logo: "HERO"
  },
  {
    name: "Jindal Stainless",
    revenue: "436B",
    sector: "Steel",
    logo: "JS"
  },
  {
    name: "LTIMindtree",
    revenue: "417B",
    sector: "IT Services",
    logo: "LTI"
  },
  {
    name: "TVS Motor",
    revenue: "416B",
    sector: "Automotive",
    logo: "TVS"
  }
];

export const brands: BrandEntry[] = companySeed.map((company, index) => ({
  ...company,
  baseCts: Math.max(220, 920 - index * 12)
}));
