import type { PaymentIntent } from "@/types/payment";

export async function parseIntentWithGemini(
  input: string,
): Promise<PaymentIntent> {
  const response = await fetch("/api/intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  const data = (await response.json()) as
    | PaymentIntent
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : "Unable to understand that payment request.",
    );
  }

  return data as PaymentIntent;
}
