import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const payoutSchema = z.object({
  amount: z.number().positive().max(10000),
  currency: z.literal("USD"),
  note: z.string().max(127).optional().default(""),
  recipientName: z.string().min(1).max(127),
});

type PayPalBatchResponse = {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
  };
  items?: Array<{
    payout_item_id?: string;
    transaction_status?: string;
    transaction_id?: string;
    errors?: {
      name?: string;
      message?: string;
    };
  }>;
};

function getConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const recipientEmail = process.env.PAYPAL_SANDBOX_RECIPIENT_EMAIL;
  const sandboxBaseUrl = "https://api-m.sandbox.paypal.com";
  const baseUrl = process.env.PAYPAL_BASE_URL ?? sandboxBaseUrl;

  if (baseUrl !== sandboxBaseUrl) {
    throw new Error("KilnGrid prototype only permits PayPal Sandbox.");
  }

  if (!clientId || !clientSecret || !recipientEmail) {
    throw new Error("PayPal sandbox configuration is incomplete.");
  }

  return {
    clientId,
    clientSecret,
    recipientEmail,
    baseUrl,
  };
}

async function getAccessToken() {
  const { clientId, clientSecret, baseUrl } = getConfig();

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString("base64");

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const data = (await response.json()) as {
    access_token?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error("Unable to authenticate with PayPal Sandbox.");
  }

  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const parsed = payoutSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payout request." },
        { status: 400 },
      );
    }

    const { amount, currency, note, recipientName } = parsed.data;
    const { baseUrl, recipientEmail } = getConfig();
    const accessToken = await getAccessToken();

    const response = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: `kilngrid-${randomUUID()}`,
          recipient_type: "EMAIL",
          email_subject: "KilnGrid sandbox payment",
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: {
              value: amount.toFixed(2),
              currency,
            },
            receiver: recipientEmail,
            note: note || `KilnGrid payment to ${recipientName}`,
            sender_item_id: `kilngrid-item-${randomUUID()}`,
          },
        ],
      }),
    });

    const data = (await response.json()) as PayPalBatchResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: "PayPal rejected the sandbox payout." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      batchId: data.batch_header?.payout_batch_id ?? null,
      batchStatus: data.batch_header?.batch_status ?? null,
    });
  } catch (error) {
    console.error("PayPal payout error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create sandbox payout.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json(
        { error: "batchId is required." },
        { status: 400 },
      );
    }

    const { baseUrl } = getConfig();
    const accessToken = await getAccessToken();

    const response = await fetch(
      `${baseUrl}/v1/payments/payouts/${encodeURIComponent(batchId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      },
    );

    const data = (await response.json()) as PayPalBatchResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to retrieve PayPal payout status." },
        { status: 502 },
      );
    }

    const item = data.items?.[0];

    return NextResponse.json({
      batchId: data.batch_header?.payout_batch_id ?? batchId,
      batchStatus: data.batch_header?.batch_status ?? null,
      itemStatus: item?.transaction_status ?? null,
      payoutItemId: item?.payout_item_id ?? null,
      transactionId: item?.transaction_id ?? null,
      errorName: item?.errors?.name ?? null,
      errorMessage: item?.errors?.message ?? null,
    });
  } catch (error) {
    console.error("PayPal status error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to retrieve sandbox payout status.",
      },
      { status: 500 },
    );
  }
}

