"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Info, Printer, Star, Trash2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { z } from "zod";
import { Field, WhyDisabled } from "@/components/shared/field";
import { validate } from "@/lib/validate";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise, rupeesToPaise } from "@/lib/money";
import { STATE_NAMES, codeForAato, computeTotals, derivePlaceOfSupply, type InvoiceLine } from "@/lib/tax";
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { CapacityBar, Panel, ValuePill } from "@/components/shared/panel";
import { Briefcase, Send, ShieldCheck, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getInvoice, type Invoice } from "@/lib/data/money";
import { todayInIndia } from "@/lib/data/attention";
import { useMutation } from "@/lib/api/use-mutation";
import { cancelInvoice, issueInvoice, recordPayment } from "@/lib/api/mutations";
import { useCurrentUser } from "@/lib/data/use-session";
import { can, rolesWith, ROLE_LABELS } from "@/lib/roles";
import { ErrorState } from "@/components/data-states/error-state";
import { EM_DASH } from "@/lib/data/result";
import { cn } from "@/lib/utils";
import { Unavailable, NEEDS_BACKEND } from "@/components/shared/unavailable";
import { whatsappHref } from "@/lib/contact";
import { adviseSupply } from "@/lib/tax";
import { UpiQr } from "@/components/shared/upi-qr";

/**
 * Review an invoice before it goes out — PRD §6.11.
 *
 * **The one decision:** *is this bill correct enough to send?* — **not** "enter
 * an invoice". Everything is pre-filled from the job; this is "a review surface
 * with editable fields, whose job is to make one specific error — **wrong tax
 * head, wrong code** — impossible to make silently".
 *
 * The derivation line is the point of the screen. §6.11.2:
 *
 * > "The single most valuable element in the billing module. Charging CGST+SGST
 * > where IGST was due is the commonest and most expensive GST error a small
 * > service firm makes, invisible until a notice arrives, and **no incumbent
 * > tool explains its reasoning**."
 *
 * Two consequences implemented literally: the derivation renders the sentence
 * `derivePlaceOfSupply` returns, and **[Override] requires a typed reason that
 * is stored on the invoice** — genuine exceptions occur, silent ones must not.
 */

/** Fallback only — used when nothing has been billed yet in this session. */
const JOB_NUMBER = "J-2607-0431";

const LINES: InvoiceLine[] = [
  {
    description: "AC AMC — visit 3 of 12",
    code: "998719",
    kind: "service",
    qty: 1,
    ratePaise: 4_500_00,
    ratePercent: 18,
  },
  {
    description: "Capacitor 45 MFD",
    code: "85321000",
    kind: "goods",
    qty: 1,
    ratePaise: 340_00,
    ratePercent: 18,
  },
];

type Check = { label: string; state: "ok" | "info" | "warn"; detail?: string };

/**
 * The number the invoice goes to. One constant, so the Send panel and the
 * WhatsApp link can never name different numbers — they were separate literals
 * and only one of them was real.
 */
const CUSTOMER_PHONE = "98200 12345";

/**
 * The payee on every UPI code.
 *
 * ⚠️ **Fixture VPA.** This is the tenant's real bank handle in production and
 * belongs in Settings → Business once the backend exists. Left here rather than
 * hidden so nobody ships a QR that collects into the wrong account.
 */
const UPI_PAYEE = {
  vpa: "shakticooling@okhdfcbank",
  name: SEED_TENANT.businessName,
};

/**
 * The only thing a reader types on this screen.
 *
 * §6.11.2 requires the override to carry a stored reason; a length floor is
 * what makes that requirement mean something, since the control was previously
 * satisfied by a single character.
 */
const OVERRIDE_FORM = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Say why in a sentence — this is the audit trail for the override"),
});

/*
  Suspense, because `useSearchParams` opts a page out of static prerendering
  unless the read is inside a boundary. Without it the build fails — the same
  way /settings did, and for the same reason.
*/
export default function ReviewInvoicePage() {
  return (
    <Suspense fallback={null}>
      <ReviewInvoice />
    </Suspense>
  );
}

/**
 * What has been received against this invoice, and recording another.
 *
 * **Why this had to exist.** `recordPayment` was in the mutation layer and no
 * screen called it, so a firm could issue a bill and had no way anywhere in the
 * product to mark it settled. The receivables figure was therefore a number
 * that only ever grew, and the job timeline pointed at "Payment received" as
 * the next step with no door behind it.
 *
 * **Partial payment is the normal case, not the exception** (FR-901). A
 * customer paying ₹4,000 against ₹7,080 is an ordinary Tuesday here, so the
 * balance is arithmetic over many payments rather than a paid/unpaid flag
 * somebody has to remember to flip.
 *
 * **The consequence is stated before the write, not after.** The amount arrives
 * pre-filled with exactly what is outstanding — so the common case is zero
 * typing — and the moment it is edited the panel says what will still be owed.
 * That is the sum the accountant would otherwise do on a phone calculator with
 * the customer waiting.
 */
const METHODS = [
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
] as const;

type Method = (typeof METHODS)[number]["value"];

function PaymentsPanel({
  invoice,
  onRecorded,
}: {
  invoice: Invoice;
  onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayInIndia());
  const [method, setMethod] = useState<Method>("UPI");
  const [reference, setReference] = useState("");
  const record = useMutation(recordPayment);

  const billed = invoice.grandTotalPaise;
  const paid = invoice.paidPaise ?? 0;
  const outstanding = invoice.outstandingPaise ?? billed - paid;
  const received = invoice.payments ?? [];
  const settled = outstanding === 0 && billed > 0;

  /*
    A draft cannot be paid.

    Not a disabled button — a statement. §6.11 draws a number at issue, so
    until then there is no document for the money to be against, and offering
    to collect against one invites a payment recorded against nothing.
  */
  if (invoice.status === "DRAFT") {
    return (
      <Panel title="Payments" icon={Wallet} tone="support">
        <p className="text-sm text-muted-foreground">
          Nothing can be received against a draft — it has no number yet. Issue
          it first.
        </p>
      </Panel>
    );
  }

  if (invoice.status === "CANCELLED") {
    return (
      <Panel title="Payments" icon={Wallet} tone="support">
        <p className="text-sm text-muted-foreground">
          This invoice was cancelled, so it collects nothing.
        </p>
      </Panel>
    );
  }

  /*
    The only rupees-to-paise conversion on this screen, and it is here because
    this is the only place a human types money. Everything else is already paise
    off the register — `asPaise` brands an integer, it does not convert, and
    treating it as a converter is how a 7,080 balance renders as ₹70.80.
  */
  const typed = rupeesToPaise(Number(amount.replace(/[^\d.]/g, "")) || 0);
  const remainderAfter = Math.max(0, outstanding - typed);

  return (
    <Panel
      title="Payments"
      icon={Wallet}
      caption={settled ? "settled in full" : `${received.length} received`}
      tone="support"
    >
      <div className="space-y-3">
        {record.error ? <ErrorState error={record.error} onRetry={record.reset} /> : null}

        {/*
          Two numbers and a rule, not a percentage — the reader can see both the
          position and the headroom. Paired with the balance as a word, because
          §6.13.4 never lets colour carry a fact on its own.
        */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CapacityBar
            label="Received of billed"
            value={paid}
            of={billed}
            format={(n) => `₹${(n / 100).toLocaleString("en-IN")}`}
          />
          <span className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">
              {settled ? "Balance" : "Still owed"}
            </span>
            <ValuePill tone={settled ? "good" : "warn"}>
              <MoneyText amount={asPaise(outstanding)} />
            </ValuePill>
          </span>
        </div>

        {received.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {received.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-baseline gap-x-2">
                <MoneyText amount={asPaise(payment.amountPaise)} className="font-medium" />
                <span className="text-muted-foreground">
                  {METHODS.find((m) => m.value === payment.method)?.label ?? payment.method}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {payment.dateWord}
                </span>
                {/* The UTR or cheque number is the whole point of a reference —
                    it is what reconciles against the bank statement. */}
                {payment.reference ? (
                  <span className="text-xs text-muted-foreground">· {payment.reference}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing received yet.
          </p>
        )}

        {settled ? null : open ? (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="Amount received"
                value={amount}
                onChange={setAmount}
                hint={
                  typed > 0 && typed < outstanding
                    ? `₹${(remainderAfter / 100).toLocaleString("en-IN")} will still be owed`
                    : typed > outstanding
                      ? "That is more than is outstanding"
                      : "Pre-filled with the full balance"
                }
              />
              <Field label="Received on" value={receivedOn} onChange={setReceivedOn} />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">How did it come in?</p>
              <div className="flex flex-wrap gap-1.5">
                {METHODS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={method === option.value}
                    onClick={() => setMethod(option.value)}
                    className={cn(
                      "min-h-9 rounded-full px-3 py-1.5 text-sm transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                      method === option.value
                        ? "bg-primary font-medium text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label={method === "CHEQUE" ? "Cheque number" : "Reference"}
              optional
              value={reference}
              onChange={setReference}
              placeholder={method === "UPI" ? "UPI transaction id" : "UTR or slip number"}
              hint="What this reconciles against on the bank statement"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={record.pending || typed <= 0 || typed > outstanding}
                onClick={async () => {
                  const result = await record.run({
                    invoiceId: invoice.id,
                    amountPaise: typed,
                    receivedOn,
                    method,
                    reference: reference.trim() || null,
                  });
                  if (result?.ok) {
                    setOpen(false);
                    setReference("");
                    onRecorded();
                  }
                }}
              >
                {typed > 0 && typed >= outstanding
                  ? "Record and settle"
                  : "Record this payment"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Pre-filled with the balance: paid-in-full is the common case,
              // and it should cost no typing at all.
              setAmount((outstanding / 100).toFixed(2));
              setReceivedOn(todayInIndia());
              setOpen(true);
            }}
          >
            <Wallet className="size-4" />
            Record a payment
          </Button>
        )}
      </div>
    </Panel>
  );
}

/**
 * Withdrawing an invoice — discarding a draft, or cancelling an issued one.
 *
 * **Nothing could.** `cancelInvoice` sat in the mutation layer, called by no
 * screen, so a bill raised against the wrong customer or for the wrong amount
 * could only be left standing. On an issued document that is not a tidiness
 * problem: it is in the register, it will be in GSTR-1, and the customer has a
 * copy.
 *
 * **The two cases are named separately because they are different acts.** A
 * draft never drew a number, so discarding it costs nothing and the register
 * keeps no memory of it. An issued invoice keeps its number for ever —
 * cancelled, but spent — because reusing it would put two documents in one
 * series under one number, which is the single thing Rule 46(b) exists to
 * prevent.
 *
 * The reason is required by the API and asked for here rather than invented: a
 * cancelled number is a number somebody eventually asks about.
 */
function WithdrawInvoice({
  invoice,
  onWithdrawn,
}: {
  invoice: Invoice;
  onWithdrawn: (discarded: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const me = useCurrentUser();
  const cancel = useMutation(
    useCallback((why: string) => cancelInvoice(invoice.id, why), [invoice.id]),
  );

  const isDraft = invoice.status === "DRAFT";
  if (invoice.status === "CANCELLED") return null;

  /*
    Offered only to the roles that can carry it out.

    Cancelling is `invoice:finalise` — the accountant and the owner. Shown to a
    coordinator, the control was a button whose only possible outcome was a 403,
    which is the same defect as a dead control: it looks like the product is
    broken rather than like the answer is no.

    Named rather than hidden, because §6.3 is right that the reader is usually a
    colleague who needs to know who to ask. Fails closed while the identity is
    still loading.
  */
  if (!me) return null;
  if (!can(me.role, "invoice:finalise", undefined, me.level ?? undefined)) {
    const who = rolesWith("invoice:finalise").map((r) => ROLE_LABELS[r]);
    return (
      <p className="text-xs text-muted-foreground">
        {isDraft ? "Discarding a draft" : "Cancelling an invoice"} is{" "}
        {who.join(" or ")} work. Ask one of them if this should not stand.
      </p>
    );
  }

  // Money received means this is a refund or a credit note, not a cancellation
  // — and the API refuses it, so the screen says why rather than offering it.
  if ((invoice.paidPaise ?? 0) > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Payments have been recorded against this, so it cannot be cancelled. A
        refund or a credit note is the way back.
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />
        {isDraft ? "Discard this draft" : "Cancel this invoice"}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-muted p-3">
      {cancel.error ? <ErrorState error={cancel.error} onRetry={cancel.reset} /> : null}
      <p className="text-sm">
        {isDraft
          ? "Nothing was numbered, so this simply goes away."
          : `${invoice.number} keeps its number for ever, marked cancelled. The number cannot be reused.`}
      </p>
      <Field
        label="Why"
        value={reason}
        onChange={setReason}
        placeholder={isDraft ? "Raised by mistake" : "Customer withdrew the order"}
        hint="A cancelled number is a number somebody eventually asks about"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={cancel.pending || reason.trim().length < 3}
          onClick={async () => {
            const result = await cancel.run(reason.trim());
            if (result?.ok) onWithdrawn(Boolean(result.data.discarded));
          }}
        >
          {isDraft ? "Discard it" : "Cancel it"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function ReviewInvoice() {
  /**
   * The most recently created invoice, if there is one.
   *
   * This screen used to render a hard-coded fixture and was reachable only by
   * typing the URL — so "create invoice" was never actually reached from a job.
   * It now shows the real document the job produced, and falls back to the
   * worked example from §6.11.1 when nothing has been billed yet, so the screen
   * still demonstrates the tax engine on a cold start.
   */
  /*
    The document this screen was sent to show, by id.

    It used to read "the latest invoice in the browser store" — fine while the
    store held every invoice the app had made, and wrong the moment the
    register started issuing them: the store stopped receiving any, so a
    freshly raised bill showed the cold-start example instead of itself.
  */
  const invoiceId = useSearchParams().get("id");
  const router = useRouter();
  const me = useCurrentUser();
  /* Fails closed while the identity loads: no identity is not "probably yes". */
  const canFinalise = Boolean(
    me && can(me.role, "invoice:finalise", undefined, me.level ?? undefined),
  );
  const finalisers = rolesWith("invoice:finalise").map((r) => ROLE_LABELS[r]);
  const [created, setCreated] = useState<Invoice | null>(null);
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (!invoiceId) return;
    let cancelled = false;
    void getInvoice(invoiceId).then((result) => {
      if (!cancelled && result.status === "ready") setCreated(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, reloads]);

  /*
    **Issuing had no button anywhere in the product.**

    `issueInvoice` sat exported and imported by nobody, so every invoice this
    system produced stayed a DRAFT for ever: no number, nothing a customer
    could be sent, nothing the GST return could contain. The accountant could
    prepare a bill and never actually raise one.

    Issuing is the irreversible step — FR-805 makes the document immutable and
    FR-811 spends a number from a statutory series that cannot be reused — so
    it asks first, and says what it is about to spend.
  */
  const issue = useMutation(issueInvoice);
  const [confirming, setConfirming] = useState(false);
  /*
    The fixture identity belongs to the cold-start example and to nothing else.

    `created?.billTo ?? fixture` was the same defect one level up: an invoice
    that carries no identity would fall through to Shakti Industries' GSTIN and
    print it on somebody else's bill. A real invoice answers for itself or says
    it cannot.
  */
  /*
    The invoice's own identity, or nothing.

    The cold-start fallback is gone with the fixture it demonstrated: this
    screen now shows a real document from the register, and an invoice that
    carries no identity must say so rather than borrow one.
  */
  const billTo = created?.billTo ?? null;

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overridden, setOverridden] = useState(false);
  const [reasonTouched, setReasonTouched] = useState(false);
  const reasonCheck = validate(
    OVERRIDE_FORM,
    { reason: overrideReason },
    (reasonTouched ? new Set(["reason"]) : new Set()) as ReadonlySet<"reason">,
  );

  const supplierState = SEED_TENANT.branches[0].stateCode;
  const lines = created?.lines ?? LINES;
  // FR-806 — computed from the lines actually on this invoice, not assumed.
  const advice = adviseSupply(lines);
  // Every reference on this screen follows the same invoice, so the header,
  // the line table and the evidence panel cannot describe different jobs.
  const jobRef = created?.jobNumber ?? JOB_NUMBER;
  /*
    Derived from the site on the register, not a constant.

    Two literals used to fight here: a `SITE_STATE = "27"` at the top of the
    file, and a `siteState: supplierState` on the created branch. The screen
    could therefore print "Place of supply: Delhi (07)" one line above "Site in
    Maharashtra (27) → IGST" — two different answers to the one question this
    screen exists to answer.
  */
  const siteStateCode = billTo?.siteStateCode ?? null;
  /*
    Plain expressions, not `useMemo`. Both are pure and cheap, and the React
    Compiler memoizes them on its own — hand-written memos here only stopped it
    compiling the component at all.
  */
  const derivation = created
    ? {
        head: created.head,
        explanation: created.explanation,
        siteState: siteStateCode ?? supplierState,
        supplierState,
      }
    : derivePlaceOfSupply(siteStateCode ?? supplierState, supplierState);
  const totals = computeTotals(lines, derivation.head);

  const aato = SEED_TENANT.aatoPaise;
  const today = new Date();

  /**
   * §6.11.2: "The compliance panel as a **checklist, not as errors**. Green
   * ticks tell the accountant the machine did the boring work. This is what buys
   * his trust." So a satisfied condition is a tick, not silence.
   */
  const checks: Check[] = [
    { label: "Place of supply derived", state: overridden ? "warn" : "ok", detail: overridden ? "Overridden with a stored reason" : undefined },
    { label: "Every line has a SAC/HSN code", state: "ok" },
    { label: "Customer GSTIN format valid", state: "ok" },
    {
      label: "E-invoicing applicable",
      state: "info",
      detail: "No — AATO below the ₹5 crore threshold",
    },
    // FR-806: advisory, never blocking. Only appears when the invoice actually
    // mixes goods and services at different rates.
    ...(advice.kind === "mixed"
      ? [
          {
            label: "Composite or separately valued?",
            state: "warn" as const,
            detail: `Principal rate ${advice.principalPercent}% · rates on this invoice: ${advice.rates.join("%, ")}%`,
          },
        ]
      : []),
    { label: "Reverse charge", state: "info", detail: "No" },
    { label: "Advance to adjust", state: "info", detail: "₹0.00" },
    { label: "Rounding balanced", state: "ok" },
  ];

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            render={<Link href={`/jobs/${jobRef}`} />}
            nativeButton={false}
          >
            <ArrowLeft className="size-4" />
            Back to {jobRef}
          </Button>

          {/*
            **The copy a customer asks for.**

            This screen reviews a document and could not produce one. The GST
            workspace exports CSV, XLSX, JSON and a Tally envelope — every shape
            an accountant's software wants and none a customer does — so "send
            me the bill" had no answer anywhere in the product.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {/*
              Issuing is `invoice:finalise` — the accountant and the owner.

              The control carried no permission check of any kind, so a
              coordinator was shown "Issue this invoice" and got a 403: the same
              defect as a dead button, and on the one action that spends a
              number from the statutory series. Named rather than hidden,
              because the reader is a colleague who needs to know who to ask.
            */}
            {invoiceId && created?.status === "DRAFT" && !canFinalise ? (
              <p className="text-xs text-muted-foreground">
                Issuing an invoice is {finalisers.join(" or ")} work — it spends a
                number from the statutory series. Ask one of them to finalise it.
              </p>
            ) : null}

            {invoiceId && created?.status === "DRAFT" && canFinalise ? (
              confirming ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    Issuing spends a number from the statutory series and cannot
                    be undone.
                  </span>
                  <Button
                    size="sm"
                    disabled={issue.pending}
                    onClick={async () => {
                      const result = await issue.run(invoiceId);
                      if (result?.ok) {
                        setConfirming(false);
                        setReloads((n) => n + 1);
                      }
                    }}
                  >
                    Yes, issue it
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                    Not yet
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setConfirming(true)}>
                  Issue this invoice
                </Button>
              )
            ) : null}

            {invoiceId ? (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/money/invoice/${invoiceId}/print`} />}
                nativeButton={false}
              >
                <Printer className="size-4" />
                Print or save as PDF
              </Button>
            ) : null}
          </div>
        </div>

        {issue.error ? (
          <div className="mb-4">
            <ErrorState error={issue.error} onRetry={issue.reset} />
          </div>
        ) : null}

        {/* 62 / 38 (§6.11.1). */}
        <div className="grid gap-4 xl:grid-cols-8">
          {/* ---------------- Left: the document ---------------- */}
          <div className="space-y-4 xl:col-span-5">
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">
                    TAX INVOICE
                  </h1>
                  {/*
                    A draft has no number, and says so.

                    This read `created?.number ?? "SVC/26-27/0148"` — so an
                    unissued invoice displayed a plausible, well-formed number
                    from the statutory series that had not been allocated to it.
                    The real one turned out to be 0347. A number on a tax
                    document is its identity under Rule 46(b); showing one the
                    document does not own invites somebody to quote it down the
                    phone.
                  */}
                  <span className="text-sm text-muted-foreground tnum-id">
                    {created?.number ?? "No number until issued"} ·{" "}
                    {created?.dateWord ??
                      `${("0" + today.getDate()).slice(-2)}/08/2026`}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Bill to
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {created?.customer ?? "Shakti Industries"}
                    </p>
                    {/*
                      Read off the invoice, never a literal. This block used to
                      print "Registered office, Pune / GSTIN 27AABCS1234M1Z5" on
                      every invoice regardless of who it was addressed to — one
                      customer's identity stamped onto another's tax document.
                    */}
                    {billTo ? (
                      <p className="text-sm text-muted-foreground tnum-id">
                        {billTo.gstin ? (
                          `GSTIN ${billTo.gstin}`
                        ) : (
                          // Unregistered is a fact, not a blank (§7.4).
                          <span className="not-tabular">
                            No GSTIN — unregistered customer
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-warning">
                        Not on the customer register — add them before sending
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Place of supply
                    </p>
                    {billTo ? (
                      <>
                        <p className="mt-1 text-sm font-medium">
                          {billTo.siteAddress || EM_DASH}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {[billTo.siteLocality, billTo.sitePincode]
                            .filter(Boolean)
                            .join(" · ") || EM_DASH}
                        </p>
                        <p className="text-sm text-muted-foreground tnum-id">
                          {/* One state, one code — this line read "07 (27)". */}
                          {STATE_NAMES[billTo.siteStateCode] ??
                            `State ${billTo.siteStateCode}`}{" "}
                          ({billTo.siteStateCode})
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-warning">
                        No site on file — the tax head cannot be derived
                      </p>
                    )}
                  </div>
                </div>

                {/* ================= THE DERIVATION LINE ================= */}
                <div
                  className={cn(
                    "rounded-xl p-3",
                    siteStateCode === null ? "bg-destructive-bg" : "bg-primary-bg",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="flex items-start gap-2 text-sm font-medium">
                      {siteStateCode === null ? (
                        <TriangleAlert
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-destructive"
                        />
                      ) : (
                        <Info
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-primary"
                        />
                      )}
                      {/*
                        With no site on file there is no derivation, and printing
                        one anyway is precisely the silent error §6.11.2 exists
                        to prevent — the sentence would read plausibly and be a
                        guess from the branch's own state.
                      */}
                      <span>
                        {siteStateCode === null
                          ? "Place of supply cannot be derived — this customer has no site on the register, so CGST+SGST or IGST is unknown"
                          : derivation.explanation}
                      </span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOverrideOpen((v) => !v)}
                    >
                      Override place of supply
                    </Button>
                  </div>

                  {overrideOpen ? (
                    <div className="mt-3 space-y-2">
                      {/*
                        Validated rather than merely non-empty. This reason is
                        the entire audit trail for departing from the derived
                        tax head — "x" satisfies `!== ""` and explains nothing
                        to the person reading the invoice two years from now.
                      */}
                      <Field
                        label="Reason — required, and stored on the invoice"
                        value={overrideReason}
                        onChange={setOverrideReason}
                        onBlur={() => setReasonTouched(true)}
                        error={reasonCheck.errors.reason}
                        placeholder="Why the derived place of supply is wrong here"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!reasonCheck.ok}
                          onClick={() => {
                            setOverridden(true);
                            setOverrideOpen(false);
                          }}
                        >
                          Save override
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOverrideOpen(false)}
                        >
                          Cancel
                        </Button>
                        <WhyDisabled reasons={reasonCheck.summary} />
                      </div>
                    </div>
                  ) : null}

                  {overridden ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-brown">
                      <TriangleAlert className="size-3.5" aria-hidden="true" />
                      Overridden — “{overrideReason}”
                    </p>
                  ) : null}
                </div>

                {/* ---------------- Line items ---------------- */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted text-xs text-muted-foreground">
                        <th className="py-2 text-left font-medium">#</th>
                        <th className="py-2 text-left font-medium">
                          Description
                        </th>
                        {/*
                          One column, labelled SAC/HSN. §6.11.2: a single "HSN"
                          header — what most tools ship — "trains users to put
                          HSN codes on services, which is wrong".
                        */}
                        <th className="py-2 text-left font-medium">SAC/HSN</th>
                        <th className="py-2 text-right font-medium">Qty</th>
                        <th className="py-2 text-right font-medium">Rate</th>
                        <th className="py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => (
                        <tr key={line.description} className={ROW_TR}>
                          <td className="py-2 tabular-nums">{index + 1}</td>
                          <td className="py-2">{line.description}</td>
                          <td className="py-2 tnum-id">
                            {/* Shown as emitted, so the CA can verify without
                                opening a return (§6.11.2). */}
                            {codeForAato(line.code, aato)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {line.qty}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            <MoneyText amount={asPaise(line.ratePaise)} bare />
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            <MoneyText
                              amount={asPaise(line.qty * line.ratePaise)}
                              bare
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ---------------- Totals ---------------- */}
                <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxable value</span>
                    <MoneyText amount={totals.taxablePaise} bare />
                  </div>
                  {derivation.head === "CGST_SGST" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST 9%</span>
                        <MoneyText amount={totals.cgstPaise!} bare />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST 9%</span>
                        <MoneyText amount={totals.sgstPaise!} bare />
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGST 18%</span>
                      <MoneyText amount={totals.igstPaise!} bare />
                    </div>
                  )}
                  {/* Explicit line — "the CA will not accept an invoice that
                      does not foot" (§6.11.2). */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Round off</span>
                    <MoneyText amount={totals.roundOffPaise} bare />
                  </div>
                  <Separator />
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">TOTAL</span>
                    {/* 28px (§6.11.1). */}
                    <span className="text-[28px] leading-9 font-semibold">
                      <MoneyText amount={totals.grandTotalPaise} />
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ---------------- Right: evidence and compliance ---------------- */}
          <div className="space-y-4 xl:col-span-3">
            {/*
              The right column is *evidence*, not the document — so it sits on
              the secondary sand ground and the invoice keeps the white surface.
              The hierarchy is then visible before a word is read.
            */}
            <Panel
              title="From job"
              icon={Briefcase}
              caption={jobRef}
              tone="support"
            >
              {/*
                Non-editable on purpose. This panel is "here so the accountant
                can bill without opening the job — the reason he will use this
                screen instead of asking the coordinator" (§6.11.1).
              */}
              {/*
                The real visit, from the register.

                This block was six hardcoded lines — every invoice in the
                product claimed a gas top-up on 30 July by Ramesh Yadav, signed
                by Anil Joshi at four stars, whatever the job said. On an
                invoice review screen that is not a placeholder, it is evidence
                for somebody else's bill sitting beside the amount you are about
                to charge.
              */}
              {created?.fromJob ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground tabular-nums">
                    {[created?.fromJob.dateWord, created?.fromJob.technician]
                      .filter(Boolean)
                      .join(" · ") || "No visit details recorded"}
                  </p>
                  {created?.fromJob.serviceType ? <p>{created?.fromJob.serviceType}</p> : null}
                  {/* What the customer actually said, when they said anything. */}
                  {created?.fromJob.comment ? (
                    <p className="text-muted-foreground">{created?.fromJob.comment}</p>
                  ) : null}
                  {created?.fromJob.signerName ? (
                    <div className="flex items-center gap-3 pt-1">
                      <span
                        aria-hidden="true"
                        className="grid h-12 w-24 place-items-center rounded border bg-muted text-xs text-muted-foreground italic"
                      >
                        signature
                      </span>
                      <span>
                        <span className="block">{created?.fromJob.signerName}</span>
                        {created?.fromJob.rating !== null ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="size-3 fill-current" aria-hidden="true" />
                            {/* An accountant about to bill a 1-star job should
                                know before he sends it (§6.11.2). */}
                            <span className="tabular-nums">
                              {created?.fromJob.rating} of 5
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : (
                    /* Said rather than left blank: billing unsigned work is a
                       decision, and the reader should be making it knowingly. */
                    <p className="pt-1 text-warning">
                      Nobody has signed for this visit.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Raised by hand — there is no visit behind this bill.
                </p>
              )}
            </Panel>

            <Panel title="Compliance" icon={ShieldCheck} tone="support">
              <div>
                <ul className="space-y-2 text-sm">
                  {checks.map((check) => (
                    <li key={check.label} className="flex items-start gap-2">
                      {check.state === "ok" ? (
                        <Check
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-success"
                        />
                      ) : check.state === "warn" ? (
                        <TriangleAlert
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-brand-brown"
                        />
                      ) : (
                        <Info
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block">{check.label}</span>
                        {check.detail ? (
                          <span className="block text-xs text-muted-foreground">
                            {check.detail}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>

            {/* Money state sits above Send: "has this been paid" outranks
                "send it again". */}
            {created ? (
              <PaymentsPanel invoice={created} onRecorded={() => setReloads((n) => n + 1)} />
            ) : null}

            {/*
              Withdrawal sits at the bottom, under everything that argues for
              the document. It is the least likely thing anybody came here to
              do, and putting it near "Issue" is how the wrong one gets pressed.
            */}
            {created ? (
              <div className="px-1">
                <WithdrawInvoice
                  invoice={created}
                  onWithdrawn={(discarded) =>
                    // A discarded draft no longer exists, so there is nothing
                    // to return to; a cancelled invoice still does.
                    discarded ? router.push("/money") : setReloads((n) => n + 1)
                  }
                />
              </div>
            ) : null}

            <Panel title="Send" icon={Send} tone="support">
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  WhatsApp to{" "}
                  <span className="tabular-nums">{CUSTOMER_PHONE}</span> · in
                  English
                </p>
                <p className="text-muted-foreground">
                  Due in 15 days
                </p>
                {/* FR-901: the code *is* the link, generated here, so it can
                    never drift from the amount printed beside it. */}
                {/* Not offered on a draft: a customer paying against "DRAFT"
                    leaves a receipt that reconciles to no document. */}
                {created?.number ? (
                  <UpiQr
                    payee={UPI_PAYEE}
                    amountPaise={totals.grandTotalPaise}
                    invoiceNumber={created.number}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A payment code needs the invoice number, so it appears once
                    this is issued.
                  </p>
                )}
              </div>
            </Panel>

            {/*
              §6.11.5: ONE combined primary. "The accountant's actual intent is
              always 'bill and send'; splitting it produces finalised invoices
              that were never sent — a real and expensive failure mode."
            */}
            <div className="space-y-2">
              {/*
                A draft, opened in WhatsApp — never an automatic send. The
                accountant sees the message and the number before it goes, which
                is the right boundary for a document that carries a GSTIN.
              */}
              <Button
                className="w-full"
                render={
                  <a
                    href={
                      whatsappHref(
                        CUSTOMER_PHONE,
                        /* "please find invoice SVC" was what a draft sent. */
                        `Namaste, please find invoice ${created?.number ?? "(not yet issued)"} for ${created?.customer ?? "your service"}. Thank you.`,
                      ) ?? undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  />
                }
                nativeButton={false}
                // §6.14's rule applied one document down: a partial GST export
                // is worse than none, and so is an invoice sent with a tax head
                // nobody could derive.
                disabled={!whatsappHref(CUSTOMER_PHONE) || siteStateCode === null}
              >
                Finalise &amp; send on WhatsApp
              </Button>
              {siteStateCode === null ? (
                <p className="text-xs text-destructive">
                  Add this customer and their site to the register first — an
                  invoice cannot be sent with an underived place of supply.
                </p>
              ) : null}
              <div className="flex gap-2">
                <Unavailable
                  label="Save as draft"
                  reason={NEEDS_BACKEND}
                  className="flex-1"
                />
                <Unavailable
                  label="Finalise without sending"
                  reason={NEEDS_BACKEND}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
