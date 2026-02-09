import type { AdItem, AdSlot } from "@/data/ads";

export const AD_SLOT_COUNT_PER_RAIL = 6;
export const AD_PAID_SURFACE_CAPACITY = (AD_SLOT_COUNT_PER_RAIL - 1) * 2 * 2;

export type ActiveAdCampaign = {
  id: string;
  company_name: string | null;
  tagline: string | null;
  badge: string | null;
  accent: string | null;
  destination_url: string | null;
  logo_url: string | null;
};

const fallbackAccent = "#6ecbff";
const advertiseAccent = "#f7f7f7";
const colorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const sanitizeAccent = (value: string | null | undefined) => {
  const candidate = (value ?? "").trim();
  return colorPattern.test(candidate) ? candidate : fallbackAccent;
};

export const sanitizeBadge = (value: string | null | undefined) => {
  const candidate = (value ?? "AD").trim();
  if (!candidate) return "AD";
  return candidate.slice(0, 10);
};

export const sanitizeName = (value: string | null | undefined) => {
  const candidate = (value ?? "").trim();
  return candidate.length ? candidate.slice(0, 52) : "Sponsored";
};

export const sanitizeTagline = (value: string | null | undefined) => {
  const candidate = (value ?? "").trim();
  return candidate.length ? candidate.slice(0, 120) : "Sponsored placement";
};

export const createAdvertiseItem = (spotsLeft: number): AdItem => ({
  name: "Advertise",
  tagline: `${Math.max(0, spotsLeft)}/${AD_PAID_SURFACE_CAPACITY} spots left`,
  accent: advertiseAccent,
  badge: "AD",
  kind: "advertise",
  isAdvertise: true,
  href: null,
  campaignId: null,
});

export const isAdvertiseItem = (item: AdItem) =>
  item.kind === "advertise" || item.isAdvertise || item.name.toLowerCase() === "advertise";

export const isCampaignItem = (item: AdItem) => item.kind === "campaign" && Boolean(item.campaignId);

export const toCampaignItem = (campaign: ActiveAdCampaign): AdItem => ({
  name: sanitizeName(campaign.company_name),
  tagline: sanitizeTagline(campaign.tagline),
  accent: sanitizeAccent(campaign.accent),
  badge: sanitizeBadge(campaign.badge),
  kind: "campaign",
  href: null,
  campaignId: campaign.id,
  isAdvertise: false,
  logoUrl: campaign.logo_url ?? null,
});

const flattenFallbackFaces = (slots: AdSlot[]) => {
  const faces: AdItem[] = [];
  for (const slot of slots) {
    if (!isAdvertiseItem(slot.front)) faces.push(slot.front);
    if (!isAdvertiseItem(slot.back)) faces.push(slot.back);
  }
  return faces;
};

const buildRailSlots = (
  side: "left" | "right",
  paidItems: AdItem[],
  fallbackSlots: AdSlot[],
  advertiseItem: AdItem
) => {
  const nonAdvertiseSlots = AD_SLOT_COUNT_PER_RAIL - 1;
  const requiredFaces = nonAdvertiseSlots * 2;
  const fallbackFaces = flattenFallbackFaces(fallbackSlots);

  const facePool = paidItems.length
    ? paidItems
    : fallbackFaces.length
      ? fallbackFaces
      : [advertiseItem];

  const offset = side === "right" ? 1 : 0;
  const faces = Array.from({ length: requiredFaces }, (_, index) => {
    const source = facePool[(index + offset) % facePool.length];
    return {
      ...source,
    };
  });

  const slots: AdSlot[] = [
    {
      front: { ...advertiseItem },
      back: { ...advertiseItem },
    },
  ];

  for (let slotIndex = 0; slotIndex < nonAdvertiseSlots; slotIndex += 1) {
    const front = faces[slotIndex * 2];
    const back = faces[slotIndex * 2 + 1] ?? faces[slotIndex * 2];
    slots.push({ front, back });
  }

  return slots;
};

export const buildLiveAdSlots = (
  campaigns: ActiveAdCampaign[],
  fallbackLeft: AdSlot[],
  fallbackRight: AdSlot[]
) => {
  const paidItems = campaigns.map(toCampaignItem);
  const spotsLeft = AD_PAID_SURFACE_CAPACITY - campaigns.length;
  const advertiseItem = createAdvertiseItem(spotsLeft);

  return {
    left: buildRailSlots("left", paidItems, fallbackLeft, advertiseItem),
    right: buildRailSlots("right", paidItems, fallbackRight, advertiseItem),
    spotsLeft: Math.max(0, spotsLeft),
  };
};
