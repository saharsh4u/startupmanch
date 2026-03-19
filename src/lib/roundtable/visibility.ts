import type { RoundtableSessionVisibility } from "@/lib/roundtable/types";

export const ROUNDTABLE_PUBLIC_TAG = "__rt_public_room";
export const ROUNDTABLE_PRIVATE_TAG = "__rt_private_room";

const INTERNAL_VISIBILITY_TAGS = new Set([ROUNDTABLE_PUBLIC_TAG, ROUNDTABLE_PRIVATE_TAG]);

export const normalizeRoundtableVisibility = (tags: string[] | null | undefined): RoundtableSessionVisibility => {
  const normalizedTags = Array.isArray(tags) ? tags : [];
  if (normalizedTags.includes(ROUNDTABLE_PRIVATE_TAG)) {
    return "private";
  }
  return "public";
};

export const sanitizeRoundtableTags = (tags: string[] | null | undefined) =>
  (Array.isArray(tags) ? tags : []).filter((tag) => !INTERNAL_VISIBILITY_TAGS.has(tag));

export const applyVisibilityTag = (
  tags: string[] | null | undefined,
  visibility: RoundtableSessionVisibility
) => {
  const nextTags = sanitizeRoundtableTags(tags);
  nextTags.push(visibility === "private" ? ROUNDTABLE_PRIVATE_TAG : ROUNDTABLE_PUBLIC_TAG);
  return Array.from(new Set(nextTags));
};
