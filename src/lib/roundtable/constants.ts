export const ROUND_TABLE_LIMITS = {
  createTopic: { maxCount: 3, windowMs: 60 * 60 * 1000 },
  joinSession: { maxCount: 20, windowMs: 60 * 60 * 1000 },
  raiseHand: { maxCount: 30, windowMs: 10 * 60 * 1000 },
  turnDraft: { maxCount: 120, windowMs: 60 * 1000 },
  turnSubmit: { maxCount: 1, windowMs: 2 * 60 * 1000 },
} as const;

export const ROUND_TABLE_TEXT_LIMITS = {
  titleMax: 120,
  descriptionMax: 1000,
  turnBodyMax: 600,
} as const;
