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
      accent: "#ffe0e6",
      badge: "AI"
    },
    back: {
      name: "Postopus",
      tagline: "Post everywhere, all at once. Become a Founding Tentacle.",
      accent: "#e7dcff",
      badge: "SOCIAL"
    }
  },
  {
    front: {
      name: "DataFast",
      tagline: "Analytics for your SaaS",
      accent: "#ffe8c7",
      badge: "DATA"
    },
    back: {
      name: "MedShotsAI",
      tagline: "AI-powered headshots & marketing photos for medical...",
      accent: "#d9ecff",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Chargeback.io",
      tagline: "Prevent chargebacks on autopilot",
      accent: "#dff4ff",
      badge: "SECURE"
    },
    back: {
      name: "FeatureBot",
      tagline: "Stop building features nobody wants",
      accent: "#dff7e8",
      badge: "BOT"
    }
  },
  {
    front: {
      name: "Rank Press",
      tagline: "WordPress AI agent. High-authority content for Google",
      accent: "#ffe3cc",
      badge: "SEO"
    },
    back: {
      name: "StartupSubmit",
      tagline: "Get your startup listed on 300+ directories",
      accent: "#e3eaff",
      badge: "LIST"
    }
  },
  {
    front: {
      name: "VisiLead",
      tagline: "Identify visitors. Convert them with smart flows",
      accent: "#e0f2ff",
      badge: "ADS"
    },
    back: {
      name: "GojiberryAI",
      tagline: "Find warm leads and book sales calls automatically",
      accent: "#ffe0e6",
      badge: "AI"
    }
  }
];

export const rightAdSlots: AdSlot[] = [
  {
    front: {
      name: "StartClaw",
      tagline: "Setup OpenClaw in under 60 seconds",
      accent: "#ffe0c2",
      badge: "LAUNCH"
    },
    back: {
      name: "Late",
      tagline: "Replace 12 social APIs with one",
      accent: "#ffe8d6",
      badge: "API"
    }
  },
  {
    front: {
      name: "Brand.dev",
      tagline: "API to personalize your product with logos, colors...",
      accent: "#eadcff",
      badge: "BRAND"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#d8f0ff",
      badge: "AI"
    }
  },
  {
    front: {
      name: "SiteGPT",
      tagline: "Make AI your expert customer service agent",
      accent: "#d7ecff",
      badge: "AI"
    },
    back: {
      name: "Repllymer",
      tagline: "Human replies that sell your product",
      accent: "#d9f5e8",
      badge: "CX"
    }
  },
  {
    front: {
      name: "CodeFast",
      tagline: "Learn to code in days, not years",
      accent: "#e6ecff",
      badge: "DEV"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#d8f0ff",
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
