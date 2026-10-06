import type {
  CandidateScore,
  Contact,
  PaymentIntent,
  ResolverResult,
} from "@/types/payment";

const WEIGHTS = {
  name: 0.35,
  context: 0.25,
  recency: 0.15,
  frequency: 0.1,
  amount: 0.15,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function scoreName(query: string, contact: Contact): number {
  const normalizedQuery = normalize(query);
  const normalizedFullName = normalize(contact.fullName);
  const firstName = normalize(contact.fullName.split(" ")[0]);

  if (normalizedQuery === normalizedFullName) return 1;
  if (normalizedQuery === firstName) return 1;

  if (
    contact.aliases.some(
      (alias) => normalize(alias) === normalizedQuery,
    )
  ) {
    return 0.95;
  }

  if (normalizedFullName.includes(normalizedQuery)) return 0.8;

  return 0;
}

function scoreContext(
  contextWords: string[],
  contact: Contact,
): { score: number; matches: string[] } {
  if (contextWords.length === 0) {
    return { score: 0, matches: [] };
  }

  const tags = contact.contextTags.map(normalize);

  const matches = contextWords.filter((word) =>
    tags.some(
      (tag) =>
        tag.includes(normalize(word)) ||
        normalize(word).includes(tag),
    ),
  );

  return {
    score: Math.min(matches.length / contextWords.length, 1),
    matches,
  };
}

function scoreRecency(days: number): number {
  if (days <= 7) return 1;
  if (days <= 14) return 0.8;
  if (days <= 30) return 0.5;
  if (days <= 60) return 0.2;
  return 0.1;
}

function scoreFrequency(count: number): number {
  return Math.min(count / 2, 1);
}

function scoreAmount(amount: number, contact: Contact): number {
  if (
    amount >= contact.typicalAmountMin &&
    amount <= contact.typicalAmountMax
  ) {
    return 1;
  }

  const distance =
    amount < contact.typicalAmountMin
      ? contact.typicalAmountMin - amount
      : amount - contact.typicalAmountMax;

  const range =
    contact.typicalAmountMax - contact.typicalAmountMin || 1;

  if (distance <= range * 0.5) {
    return 0.5;
  }

  return 0.1;
}

function scoreCandidate(
  intent: PaymentIntent,
  contact: Contact,
): CandidateScore {
  const name = scoreName(intent.recipientName, contact);
  const contextResult = scoreContext(
    intent.contextWords,
    contact,
  );
  const recency = scoreRecency(contact.lastInteractionDaysAgo);
  const frequency = scoreFrequency(contact.paymentCount30d);
  const amount = scoreAmount(intent.amount, contact);

  const score =
    name * WEIGHTS.name +
    contextResult.score * WEIGHTS.context +
    recency * WEIGHTS.recency +
    frequency * WEIGHTS.frequency +
    amount * WEIGHTS.amount;

  const reasons: string[] = [];

  if (name >= 0.95) {
    reasons.push(`Name matches ${contact.fullName}`);
  }

  if (contextResult.matches.length > 0) {
    reasons.push(
      `Context matches ${contextResult.matches.join(", ")}`,
    );
  }

  if (contact.lastInteractionDaysAgo <= 7) {
    reasons.push(
      `Recent activity ${contact.lastInteractionDaysAgo} days ago`,
    );
  }

  if (amount === 1) {
    reasons.push(
      `$${intent.amount.toFixed(2)} is within the usual amount range`,
    );
  }

  return {
    contact,
    score,
    breakdown: {
      name,
      context: contextResult.score,
      recency,
      frequency,
      amount,
    },
    reasons,
  };
}

export function resolveRecipient(
  intent: PaymentIntent,
  contacts: Contact[],
): ResolverResult {
  const scored = contacts
    .map((contact) => scoreCandidate(intent, contact))
    .filter((candidate) => candidate.breakdown.name > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      kind: "no_match",
      candidates: [],
    };
  }

  const top = scored[0];
  const second = scored[1];
  const gap = second ? top.score - second.score : top.score;

  if (top.score >= 0.85 && gap >= 0.2) {
    return {
      kind: "confident",
      candidate: top,
      alternatives: scored.slice(1),
    };
  }

  if (
    second &&
    top.score >= 0.45 &&
    second.score >= 0.45 &&
    gap < 0.2
  ) {
    return {
      kind: "ambiguous",
      candidates: scored.slice(0, 3),
    };
  }

  return {
    kind: "no_match",
    candidates: scored,
  };
}
