export type Currency = "USD";

export type PaymentIntent = {
  recipientName: string;
  amount: number;
  currency: Currency;
  note: string;
  contextWords: string[];
};

export type Contact = {
  id: string;
  fullName: string;
  aliases: string[];
  email: string;
  paypalId: string;
  contextTags: string[];
  lastInteractionDaysAgo: number;
  paymentCount30d: number;
  typicalAmountMin: number;
  typicalAmountMax: number;
};

export type ScoreBreakdown = {
  name: number;
  context: number;
  recency: number;
  frequency: number;
  amount: number;
};

export type CandidateScore = {
  contact: Contact;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
};

export type ResolverResult =
  | {
      kind: "confident";
      candidate: CandidateScore;
      alternatives: CandidateScore[];
    }
  | {
      kind: "ambiguous";
      candidates: CandidateScore[];
    }
  | {
      kind: "no_match";
      candidates: CandidateScore[];
    };
