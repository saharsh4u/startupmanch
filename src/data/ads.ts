export type AdItem = {
  name: string;
  tagline: string;
  accent: string;
  badge?: string;
};

export type AdSlot = {
  front: AdItem;
  back: AdItem;
};

export const leftAdSlots: AdSlot[] = [
  {
    front: {
      name: "GojiberryAI",
      tagline: "Find warm leads and book sales calls automatically",
      accent: "#442126",
      badge: "AI"
    },
    back: {
      name: "Postopus",
      tagline: "Post everywhere, all at once. Become a Founding Tentacle.",
      accent: "#3b2043",
      badge: "SOCIAL"
    }
  },
  {
    front: {
      name: "DataFast",
      tagline: "Analytics for your SaaS",
      accent: "#3c2e1f",
      badge: "DATA"
    },
    back: {
      name: "MedShotsAI",
      tagline: "AI-powered headshots & marketing photos for medical...",
      accent: "#1f2f52",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Chargeback.io",
      tagline: "Prevent chargebacks on autopilot",
      accent: "#1e2b53",
      badge: "SECURE"
    },
    back: {
      name: "FeatureBot",
      tagline: "Stop building features nobody wants",
      accent: "#1e3a4c",
      badge: "BOT"
    }
  },
  {
    front: {
      name: "Rank Press",
      tagline: "WordPress AI agent. High-authority content for Google",
      accent: "#3e2f1f",
      badge: "SEO"
    },
    back: {
      name: "StartupSubmit",
      tagline: "Get your startup listed on 300+ directories",
      accent: "#2a2945",
      badge: "LIST"
    }
  },
  {
    front: {
      name: "VisiLead",
      tagline: "Identify visitors. Convert them with smart flows",
      accent: "#2a2a2a",
      badge: "ADS"
    },
    back: {
      name: "GojiberryAI",
      tagline: "Find warm leads and book sales calls automatically",
      accent: "#442126",
      badge: "AI"
    }
  }
];

export const rightAdSlots: AdSlot[] = [
  {
    front: {
      name: "StartClaw",
      tagline: "Setup OpenClaw in under 60 seconds",
      accent: "#4a3720",
      badge: "LAUNCH"
    },
    back: {
      name: "Late",
      tagline: "Replace 12 social APIs with one",
      accent: "#3f2f1f",
      badge: "API"
    }
  },
  {
    front: {
      name: "Brand.dev",
      tagline: "API to personalize your product with logos, colors...",
      accent: "#3c1d4a",
      badge: "BRAND"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#1f3a56",
      badge: "AI"
    }
  },
  {
    front: {
      name: "SiteGPT",
      tagline: "Make AI your expert customer service agent",
      accent: "#243b5f",
      badge: "AI"
    },
    back: {
      name: "Repllymer",
      tagline: "Human replies that sell your product",
      accent: "#1d2f46",
      badge: "CX"
    }
  },
  {
    front: {
      name: "CodeFast",
      tagline: "Learn to code in days, not years",
      accent: "#2a2a2a",
      badge: "DEV"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#1f3a56",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Advertise",
      tagline: "3/20 spots left",
      accent: "#141414",
      badge: "AD"
    },
    back: {
      name: "Advertise",
      tagline: "3/20 spots left",
      accent: "#141414",
      badge: "AD"
    }
  }
];
