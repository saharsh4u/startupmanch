export type LeadPersona = "founder" | "investor" | "both";

export type LeadUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

export type LeadPayload = {
  email: string;
  persona: LeadPersona;
  intent: string;
  source: string;
  utm?: LeadUtm;
  website?: string;
};
