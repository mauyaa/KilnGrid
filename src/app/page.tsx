"use client";

import { useState, type FormEvent } from "react";
import { contacts } from "@/data/contacts";
import { parseIntentWithGemini } from "@/lib/intent/client";
import { resolveRecipient } from "@/lib/resolver/resolveRecipient";
import {
  createSandboxPayout,
  waitForSandboxPayout,
  type PayPalPayoutStatus,
} from "@/lib/paypal/client";
import type {
  CandidateScore,
  Contact,
  PaymentIntent,
  ResolverResult,
} from "@/types/payment";

const DEFAULT_REQUEST = "Pay John $15 for dinner";

export default function Home() {
  const [request, setRequest] = useState(DEFAULT_REQUEST);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [result, setResult] = useState<ResolverResult | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [receipt, setReceipt] = useState<PayPalPayoutStatus | null>(null);
  const [paymentState, setPaymentState] = useState<
    "idle" | "submitting" | "processing" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  function resetResult() {
    setIntent(null);
    setResult(null);
    setSelected(null);
    setReceipt(null);
    setPaymentState("idle");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetResult();
    setIsResolving(true);

    try {
      const parsed = await parseIntentWithGemini(request);
      const resolution = resolveRecipient(parsed, contacts);

      setIntent(parsed);
      setResult(resolution);

      if (resolution.kind === "confident") {
        setSelected(resolution.candidate.contact);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to understand that payment request.",
      );
    } finally {
      setIsResolving(false);
    }
  }

  async function confirmPayment() {
    if (!selected || !intent) return;

    setError(null);
    setReceipt(null);
    setPaymentState("submitting");

    try {
      const created = await createSandboxPayout({
        amount: intent.amount,
        currency: intent.currency,
        note: intent.note,
        recipientName: selected.fullName,
      });

      setPaymentState("processing");

      const completed = await waitForSandboxPayout(created.batchId);

      setReceipt(completed);
      setPaymentState("success");
    } catch (err) {
      setPaymentState("error");
      setError(
        err instanceof Error
          ? err.message
          : "Unable to complete the PayPal sandbox payment.",
      );
    }
  }

  function renderCandidate(candidate: CandidateScore) {
    return (
      <button
        key={candidate.contact.id}
        type="button"
        onClick={() => {
          setSelected(candidate.contact);
          setReceipt(null);
          setPaymentState("idle");
        }}
        className={`w-full rounded-2xl border p-4 text-left transition ${
          selected?.id === candidate.contact.id
            ? "border-black bg-neutral-100"
            : "border-neutral-200 hover:border-neutral-400"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">{candidate.contact.fullName}</p>
            <p className="text-sm text-neutral-500">
              @{candidate.contact.paypalId}
            </p>
          </div>

          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
            Score {(candidate.score * 100).toFixed(0)}/100
          </span>
        </div>

        {candidate.reasons.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600">
            {candidate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-12 text-neutral-950">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
            KilnGrid
          </p>

          <h1 className="text-4xl font-semibold tracking-tight">
            Pay someone the way you remember them.
          </h1>

          <p className="mt-4 max-w-xl text-neutral-600">
            Describe the payment naturally. KilnGrid resolves the person,
            explains why, and asks you to confirm before anything is sent.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <label htmlFor="payment-request" className="text-sm font-medium">
            Payment request
          </label>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="payment-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder='Pay John $15 for dinner'
              className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-black"
            />

            <button
              type="submit"
              disabled={isResolving}
              className="rounded-xl bg-black px-5 py-3 font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResolving ? "Understanding..." : "Resolve"}
            </button>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Try: Pay John $15 for dinner
          </p>
        </form>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {intent && (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Parsed intent
            </p>

            <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-neutral-500">Name</p>
                <p className="font-medium">{intent.recipientName}</p>
              </div>

              <div>
                <p className="text-neutral-500">Amount</p>
                <p className="font-medium">${intent.amount.toFixed(2)}</p>
              </div>

              <div>
                <p className="text-neutral-500">Currency</p>
                <p className="font-medium">{intent.currency}</p>
              </div>

              <div>
                <p className="text-neutral-500">Note</p>
                <p className="font-medium">{intent.note || "None"}</p>
              </div>
            </div>
          </div>
        )}

        {result?.kind === "confident" && (
          <section className="mt-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">Best match</h2>
              <p className="text-sm text-neutral-500">
                We found one clear recipient.
              </p>
            </div>

            {renderCandidate(result.candidate)}
          </section>
        )}

        {result?.kind === "ambiguous" && (
          <section className="mt-6">
            <div className="mb-3">
              <h2 className="text-xl font-semibold">
                Which person did you mean?
              </h2>
              <p className="text-sm text-neutral-500">
                These matches are too close to choose automatically.
              </p>
            </div>

            <div className="space-y-3">
              {result.candidates.map(renderCandidate)}
            </div>
          </section>
        )}

        {result?.kind === "no_match" && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold">
              We need a little more information.
            </h2>

            <p className="mt-2 text-sm text-neutral-700">
              There isn&apos;t a confident recipient yet. In the full version,
              KilnGrid would ask for an email or PayPal ID and remember it for
              next time.
            </p>
          </section>
        )}

        {selected && intent && paymentState !== "success" && (
          <section className="mt-6 rounded-3xl bg-neutral-950 p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Confirm payment
            </p>

            <div className="mt-4 flex items-end justify-between gap-6">
              <div>
                <p className="text-3xl font-semibold">
                  ${intent.amount.toFixed(2)}
                </p>

                <p className="mt-1 text-neutral-300">
                  to {selected.fullName}
                </p>

                {intent.note && (
                  <p className="mt-3 text-sm text-neutral-400">
                    {intent.note}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={confirmPayment}
                disabled={
                  paymentState === "submitting" ||
                  paymentState === "processing"
                }
                className="rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentState === "submitting"
                  ? "Starting..."
                  : paymentState === "processing"
                    ? "Processing..."
                    : paymentState === "error"
                      ? "Try again"
                      : "Confirm"}
              </button>
            </div>

            <p className="mt-4 text-xs text-neutral-400">
              PayPal Sandbox only - no real money is sent.
            </p>
          </section>
        )}

        {receipt && paymentState === "success" && selected && intent && (
          <section className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                &#10003;
              </div>

              <div>
                <h2 className="font-semibold">Sandbox payment complete</h2>
                <p className="text-sm text-neutral-500">
                  PayPal Sandbox transaction
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-neutral-100 pt-5">
              <p className="text-2xl font-semibold">
                ${intent.amount.toFixed(2)}
              </p>
              <p className="mt-1 text-neutral-600">
                Paid to {selected.fullName}
              </p>
              <div className="mt-4 space-y-1 font-mono text-xs text-neutral-400">
                <p>Transaction: {receipt.transactionId}</p>
                <p>Batch: {receipt.batchId}</p>
                <p>Payout item: {receipt.payoutItemId}</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
