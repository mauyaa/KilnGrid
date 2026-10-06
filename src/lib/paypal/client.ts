export type PayPalPayoutStatus = {
  batchId: string;
  batchStatus: string | null;
  itemStatus: string | null;
  payoutItemId: string | null;
  transactionId: string | null;
  errorName: string | null;
  errorMessage: string | null;
};

type CreatePayoutInput = {
  amount: number;
  currency: "USD";
  note: string;
  recipientName: string;
};

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  return body?.error ?? `Request failed with status ${response.status}.`;
}

export async function createSandboxPayout(input: CreatePayoutInput) {
  const response = await fetch("/api/paypal/payout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  const data = (await response.json()) as {
    batchId: string | null;
    batchStatus: string | null;
  };

  if (!data.batchId) {
    throw new Error("PayPal did not return a payout batch ID.");
  }

  return {
    batchId: data.batchId,
    batchStatus: data.batchStatus,
  };
}

export async function getSandboxPayout(batchId: string) {
  const response = await fetch(
    `/api/paypal/payout?batchId=${encodeURIComponent(batchId)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  return (await response.json()) as PayPalPayoutStatus;
}

export async function waitForSandboxPayout(
  batchId: string,
  attempts = 15,
  delayMs = 2000,
) {
  const terminalFailureStatuses = new Set([
    "FAILED",
    "RETURNED",
    "BLOCKED",
    "REFUNDED",
    "REVERSED",
    "UNCLAIMED",
  ]);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await getSandboxPayout(batchId);

    if (status.itemStatus === "SUCCESS") {
      return status;
    }

    if (
      status.itemStatus &&
      terminalFailureStatuses.has(status.itemStatus)
    ) {
      throw new Error(
        status.errorMessage ??
          `PayPal payout ended with status ${status.itemStatus}.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    "PayPal Sandbox is still processing the payout. Try checking again shortly.",
  );
}
