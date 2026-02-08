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
      accent: "#ff6b8a",
      badge: "AI"
    },
    back: {
      name: "Postopus",
      tagline: "Post everywhere, all at once. Become a Founding Tentacle.",
      accent: "#9b7bff",
      badge: "SOCIAL"
    }
  },
  {
    front: {
      name: "DataFast",
      tagline: "Analytics for your SaaS",
      accent: "#ffb347",
      badge: "DATA"
    },
    back: {
      name: "MedShotsAI",
      tagline: "AI-powered headshots & marketing photos for medical...",
      accent: "#5cc8ff",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Chargeback.io",
      tagline: "Prevent chargebacks on autopilot",
      accent: "#4fb5ff",
      badge: "SECURE"
    },
    back: {
      name: "FeatureBot",
      tagline: "Stop building features nobody wants",
      accent: "#6be3a1",
      badge: "BOT"
    }
  },
  {
    front: {
      name: "Rank Press",
      tagline: "WordPress AI agent. High-authority content for Google",
      accent: "#ffa45c",
      badge: "SEO"
    },
    back: {
      name: "StartupSubmit",
      tagline: "Get your startup listed on 300+ directories",
      accent: "#7aa0ff",
      badge: "LIST"
    }
  },
  {
    front: {
      name: "VisiLead",
      tagline: "Identify visitors. Convert them with smart flows",
      accent: "#4fd1ff",
      badge: "ADS"
    },
    back: {
      name: "GojiberryAI",
      tagline: "Find warm leads and book sales calls automatically",
      accent: "#ff6b8a",
      badge: "AI"
    }
  }
];

export const rightAdSlots: AdSlot[] = [
  {
    front: {
      name: "StartClaw",
      tagline: "Setup OpenClaw in under 60 seconds",
      accent: "#ffb86b",
      badge: "LAUNCH"
    },
    back: {
      name: "Late",
      tagline: "Replace 12 social APIs with one",
      accent: "#ffaf73",
      badge: "API"
    }
  },
  {
    front: {
      name: "Brand.dev",
      tagline: "API to personalize your product with logos, colors...",
      accent: "#b892ff",
      badge: "BRAND"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#6ecbff",
      badge: "AI"
    }
  },
  {
    front: {
      name: "SiteGPT",
      tagline: "Make AI your expert customer service agent",
      accent: "#76b7ff",
      badge: "AI"
    },
    back: {
      name: "Repllymer",
      tagline: "Human replies that sell your product",
      accent: "#6fe0b6",
      badge: "CX"
    }
  },
  {
    front: {
      name: "CodeFast",
      tagline: "Learn to code in days, not years",
      accent: "#8fa7ff",
      badge: "DEV"
    },
    back: {
      name: "Insight Analytics",
      tagline: "Professional stock research, powered by AI",
      accent: "#6ecbff",
      badge: "AI"
    }
  },
  {
    front: {
      name: "Advertise",
      tagline: "3/20 spots left",
      accent: "#f7f7f7",
      badge: "AD"
    },
    back: {
      name: "Advertise",
      tagline: "3/20 spots left",
      accent: "#f7f7f7",
      badge: "AD"
    }
  }
];
