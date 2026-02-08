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
      accent: "#f7eedf",
      badge: "AI"
    },
    back: {
      name: "Postopus",
      tagline: "Post everywhere, all at once. Become a Founding Tentacle.",
      accent: "#f3ead8",
      badge: "SOCIAL"
    }
  },
  {
    front: {
      name: "DataFast",
      tagline: "Analytics for your SaaS",
      accent: "#f4ecd9",
      badge: "DATA"
    },
    back: {
      name: "MedShotsAI",
      tagline: "AI-powered headshots & marketing photos for medical...",
      accent: "#f2e6d4",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Chargeback.io",
      tagline: "Prevent chargebacks on autopilot",
      accent: "#f6efe3",
      badge: "SECURE"
    },
    back: {
      name: "FeatureBot",
      tagline: "Stop building features nobody wants",
      accent: "#f2e9d9",
      badge: "BOT"
    }
  },
  {
    front: {
      name: "Rank Press",
      tagline: "WordPress AI agent. High-authority content for Google",
      accent: "#f5edde",
      badge: "SEO"
    },
    back: {
      name: "StartupSubmit",
      tagline: "Get your startup listed on 300+ directories",
      accent: "#f1e7d6",
      badge: "LIST"
    }
  },
  {
    front: {
      name: "VisiLead",
      tagline: "Identify visitors. Convert them with smart flows",
      accent: "#f8f1e6",
      badge: "ADS"
    },
    back: {
      name: "GojiberryAI",
      tagline: "Find warm leads and book sales calls automatically",
      accent: "#f7eedf",
      badge: "AI"
    }
  }
];

export const rightAdSlots: AdSlot[] = [
  {
    front: {
      name: "StartClaw",
      tagline: "Setup OpenClaw in under 60 seconds",
      accent: "#f3ead8",
      badge: "LAUNCH"
    },
    back: {
      name: "Late",
      tagline: "Replace 12 social APIs with one",
      accent: "#f5edde",
      badge: "API"
    }
  },
  {
    front: {
      name: "Brand.dev",
      tagline: "API to personalize your product with logos, colors...",
      accent: "#f1e7d6",
      badge: "BRAND"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#f2e6d4",
      badge: "AI"
    }
  },
  {
    front: {
      name: "SiteGPT",
      tagline: "Make AI your expert customer service agent",
      accent: "#f6efe3",
      badge: "AI"
    },
    back: {
      name: "Repllymer",
      tagline: "Human replies that sell your product",
      accent: "#f2e9d9",
      badge: "CX"
    }
  },
  {
    front: {
      name: "CodeFast",
      tagline: "Learn to code in days, not years",
      accent: "#f8f1e6",
      badge: "DEV"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#f2e6d4",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Advertise",
      tagline: "3/20 spots left",
      accent: "#fdf8ec",
      badge: "AD"
    },
    back: {
      name: "Advertise",
      tagline: "3/20 spots left",
      accent: "#fdf8ec",
      badge: "AD"
    }
  }
];
