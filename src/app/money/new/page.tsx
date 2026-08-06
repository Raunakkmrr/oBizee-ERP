"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Info, Star, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { z } from "zod";
import { Field, WhyDisabled } from "@/components/shared/field";
import { validate } from "@/lib/validate";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise } from "@/lib/money";
import { STATE_NAMES, codeForAato, computeTotals, derivePlaceOfSupply, type InvoiceLine } from "@/lib/tax";
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { Panel } from "@/components/shared/panel";
import { Briefcase, Send, ShieldCheck } from "lucide-react";
import { useStoreState } from "@/lib/data/use-store";
import { billingIdentityFor } from "@/lib/data/customers";
import { EM_DASH } from "@/lib/data/result";
import { cn } from "@/lib/utils";
import { Unavailable, NEEDS_BACKEND } from "@/components/shared/unavailable";
import { whatsappHref } from "@/lib/contact";
import { adviseSupply } from "@/lib/tax";
import { UpiQr } from "@/components/shared/upi-qr";

/**
 * Create invoice from job — PRD §6.11.
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

export default function CreateInvoicePage() {
  /**
   * The most recently created invoice, if there is one.
   *
   * This screen used to render a hard-coded fixture and was reachable only by
   * typing the URL — so "create invoice" was never actually reached from a job.
   * It now shows the real document the job produced, and falls back to the
   * worked example from §6.11.1 when nothing has been billed yet, so the screen
   * still demonstrates the tax engine on a cold start.
   */
  const storeState = useStoreState();
  const created = storeState.invoices[0] ?? null;
  /*
    The fixture identity belongs to the cold-start example and to nothing else.

    `created?.billTo ?? fixture` was the same defect one level up: an invoice
    that carries no identity would fall through to Shakti Industries' GSTIN and
    print it on somebody else's bill. A real invoice answers for itself or says
    it cannot.
  */
  const billTo = created
    ? created.billTo
    : billingIdentityFor("Shakti Industries", "Okhla Phase II");

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
  const derivation = useMemo(
    () =>
      created
        ? {
            head: created.head,
            explanation: created.explanation,
            siteState: siteStateCode ?? supplierState,
            supplierState,
          }
        : derivePlaceOfSupply(siteStateCode ?? supplierState, supplierState),
    [created, siteStateCode, supplierState],
  );
  const totals = useMemo(
    () => computeTotals(lines, derivation.head),
    [lines, derivation.head],
  );

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
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href={`/jobs/${jobRef}`} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to {jobRef}
        </Button>

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
                  <span className="text-sm text-muted-foreground tnum-id">
                    {created?.number ?? "SVC/26-27/0148"} ·{" "}
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
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground tabular-nums">
                  30 Jul 2026 · Ramesh Yadav
                </p>
                <p>Gas top-up and filter clean; capacitor replaced.</p>
                <div className="flex items-center gap-3 pt-1">
                  <span
                    aria-hidden="true"
                    className="grid h-12 w-24 place-items-center rounded border bg-muted text-xs text-muted-foreground italic"
                  >
                    signature
                  </span>
                  <span>
                    <span className="block">Anil Joshi</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="size-3 fill-current" aria-hidden="true" />
                      {/* An accountant about to bill a 1-star job should know
                          before he sends it (§6.11.2). */}
                      <span className="tabular-nums">4 of 5</span>
                    </span>
                  </span>
                </div>
              </div>
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
                <UpiQr
                  payee={UPI_PAYEE}
                  amountPaise={totals.grandTotalPaise}
                  invoiceNumber={created?.number ?? "DRAFT"}
                />
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
                        `Namaste, please find invoice ${created?.number ?? "SVC"} for ${created?.customer ?? "your service"}. Thank you.`,
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
