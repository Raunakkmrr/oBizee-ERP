"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Info, Star, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import {
  codeForAato,
  computeTotals,
  derivePlaceOfSupply,
  type InvoiceLine,
} from "@/lib/tax";
import { CURRENT_USER, SEED_TENANT } from "@/lib/data/fixtures/tenant";

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

const SITE_STATE = "27"; // Maharashtra — the job's site
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

export default function CreateInvoicePage() {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overridden, setOverridden] = useState(false);

  const supplierState = SEED_TENANT.branches[0].stateCode;
  const derivation = useMemo(
    () => derivePlaceOfSupply(SITE_STATE, supplierState),
    [supplierState],
  );
  const totals = useMemo(
    () => computeTotals(LINES, derivation.head),
    [derivation.head],
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
    { label: "Reverse charge", state: "info", detail: "No" },
    { label: "Advance to adjust", state: "info", detail: "₹0.00" },
    { label: "Rounding balanced", state: "ok" },
  ];

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href={`/jobs/${JOB_NUMBER}`} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to {JOB_NUMBER}
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
                    SVC/26-27/0148 · {("0" + today.getDate()).slice(-2)}/08/2026
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Bill to
                    </p>
                    <p className="mt-1 text-sm font-medium">Shakti Industries</p>
                    <p className="text-sm text-muted-foreground">
                      Registered office, Pune
                    </p>
                    <p className="text-sm text-muted-foreground tnum-id">
                      GSTIN 27AABCS1234M1Z5
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Place of supply
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      Plot 14, MIDC Phase II
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Okhla Phase II
                    </p>
                    <p className="text-sm text-muted-foreground tnum-id">
                      State: {derivation.siteState} ({SITE_STATE})
                    </p>
                  </div>
                </div>

                {/* ================= THE DERIVATION LINE ================= */}
                <div className="rounded-lg border border-primary/25 bg-primary/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="flex items-start gap-2 text-sm font-medium">
                      <Info
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      {/* Rendered verbatim from the pure function, so the screen
                          and the computation cannot disagree. */}
                      <span>{derivation.explanation}</span>
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
                      <label
                        htmlFor="override-reason"
                        className="block text-xs font-medium"
                      >
                        Reason — required, and stored on the invoice
                      </label>
                      <Input
                        id="override-reason"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Why the derived place of supply is wrong here"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={overrideReason.trim() === ""}
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
                      <tr className="border-b text-xs text-muted-foreground">
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
                      {LINES.map((line, index) => (
                        <tr key={line.description} className="border-b">
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
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  From job{" "}
                  <span className="font-normal text-muted-foreground tnum-id">
                    {JOB_NUMBER}
                  </span>
                </CardTitle>
              </CardHeader>
              {/*
                Non-editable on purpose. This panel is "here so the accountant
                can bill without opening the job — the reason he will use this
                screen instead of asking the coordinator" (§6.11.1).
              */}
              <CardContent className="space-y-2 text-sm">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compliance</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Send</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  WhatsApp to{" "}
                  <span className="tabular-nums">98200 12345</span> · in English
                </p>
                <p className="text-muted-foreground">
                  UPI link and QR included · due in 15 days
                </p>
              </CardContent>
            </Card>

            {/*
              §6.11.5: ONE combined primary. "The accountant's actual intent is
              always 'bill and send'; splitting it produces finalised invoices
              that were never sent — a real and expensive failure mode."
            */}
            <div className="space-y-2">
              <Button className="w-full">Finalise &amp; send on WhatsApp</Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1">
                  Save as draft
                </Button>
                <Button variant="outline" className="flex-1">
                  Finalise without sending
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
