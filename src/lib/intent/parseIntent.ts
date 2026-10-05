import { z } from "zod";
import type { PaymentIntent } from "@/types/payment";

const paymentIntentSchema = z.object({
  recipientName: z.string().min(1),
  amount: z.number().positive(),
  currency: z.literal("USD"),
  note: z.string(),
  contextWords: z.array(z.string()),
});

function extractContextWords(note: string): string[] {
  return note
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
}

export function parseIntent(input: string): PaymentIntent {
  const cleaned = input.trim();

  const match = cleaned.match(
    /^pay\s+(.+?)\s+\$(\d+(?:\.\d{1,2})?)(?:\s+for\s+(.+))?$/i,
  );

  if (!match) {
    throw new Error(
      'Try a payment request like "Pay John $15 for dinner".',
    );
  }

  const [, recipientName, amountText, noteText = ""] = match;

  const candidate = {
    recipientName: recipientName.trim(),
    amount: Number(amountText),
    currency: "USD" as const,
    note: noteText.trim(),
    contextWords: extractContextWords(noteText),
  };

  return paymentIntentSchema.parse(candidate);
}
