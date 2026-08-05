"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import { EM_DASH } from "@/lib/data/result";
import { cn } from "@/lib/utils";
import {
  BILLING_FREQUENCIES,
  BILLING_LABEL,
  COVERAGES,
  COVERAGE_LABEL,
  INVOICES_PER_YEAR,
  RECURRENCES,
  RECURRENCE_LABEL,
  VISITS_PER_YEAR,
  needsReceiptVoucher,
  perInvoiceAmount,
  type BillingFrequency,
  type Coverage,
  type Recurrence,
} from "@/lib/data/contracts";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
import { useDispatch } from "@/lib/data/use-store";

/**
 * New AMC contract — FR-106, FR-501, FR-504, FR-505, FR-810, FR-1406.
 *
 * **The screen exists to keep two things apart that every generic tool
 * conflates:** how often someone *visits*, and how often the customer is
 * *billed*. FR-505: "A monthly visit schedule with annual upfront billing is the
 * most common combination in this market and **must not be forced into per-visit
 * billing**."
 *
 * So visit schedule and billing frequency are two independent controls, and the
 * screen states the consequence of the pair in words — *"12 visits a year · 1
 * invoice of ₹3,60,000.00"* — because that sentence is the thing the owner is
 * actually deciding.
 *
 * FR-106: reached from a won lead with customer, site and quoted value already
 * carried across, so nothing is retyped. FR-501 also demands the schedule step
 * come immediately, "because a contract without a schedule generates nothing".
 */

/** FR-106's carry-across, passed down from the server page as props. */
export type NewContractPrefill = {
  fromLead: string | null;
  customer: string | null;
  site: string | null;
  value: string | null;
};

export function NewContractForm({ prefill }: { prefill: NewContractPrefill }) {
  const { fromLead } = prefill;
  const dispatch = useDispatch();
  const router = useRouter();

  // FR-106: pre-populated from the won lead — customer, site and quoted value
  // carried across so nothing is retyped.
  const [customer, setCustomer] = useState(prefill.customer ?? "");
  const [site, setSite] = useState(prefill.site ?? "");
  /**
   * Empty when the lead carried no quote — **never a default figure**.
   *
   * A pre-filled ₹3,60,000 that nobody typed is the same class of lie as
   * rendering ₹0 for a value we could not compute: it looks like data, it
   * survives a distracted glance, and it becomes a contract billed at the wrong
   * amount. The panel shows an em-dash until a real number is entered.
   */
  const [annualValue, setAnnualValue] = useState(prefill.value ?? "");

  const [coverage, setCoverage] = useState<Coverage>("COMPREHENSIVE");
  const [recurrence, setRecurrence] = useState<Recurrence>("MONTHLY");
  const [billing, setBilling] = useState<BillingFrequency>("UPFRONT_ANNUAL");
  const [anchorDay, setAnchorDay] = useState("15");

  const parsed = Number(annualValue);
  // A blank or non-numeric entry is "not yet known", not zero.
  const hasValue = annualValue.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  const annualPaise = hasValue ? Math.round(parsed * 100) : 0;
  const visits = VISITS_PER_YEAR[recurrence];
  const invoices = INVOICES_PER_YEAR[billing];
  const perInvoice = useMemo(
    () => perInvoiceAmount(annualPaise, billing, visits),
    [annualPaise, billing, visits],
  );
  const invoiceCount = invoices === "per_visit" ? visits : invoices;

  const missing = [
    customer.trim() === "" ? "Customer" : null,
    site.trim() === "" ? "Site" : null,
    hasValue ? null : "Annual value",
  ].filter((label): label is string => label !== null);
  const canCreate = missing.length === 0;

  const today = new Date();

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
          render={<Link href={fromLead ? "/leads" : "/contracts"} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          {fromLead ? "Back to leads" : "Back to contracts"}
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Work" }, { label: "Contracts", href: "/contracts" }]}
          className="mb-4"
          title="New AMC contract"
          description={
            fromLead
              ? `Converted from lead ${fromLead} — nothing retyped.`
              : "How often someone visits, and how often the customer is billed."
          }
        />

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer &amp; value</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="customer" className="mb-1.5 block text-sm font-medium">
                    Customer
                  </label>
                  <Input
                    id="customer"
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="site" className="mb-1.5 block text-sm font-medium">
                    Site
                  </label>
                  <Input
                    id="site"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="value" className="mb-1.5 block text-sm font-medium">
                    Annual contract value (₹)
                  </label>
                  <Input
                    id="value"
                    inputMode="numeric"
                    value={annualValue}
                    onChange={(e) => setAnnualValue(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="anchor" className="mb-1.5 block text-sm font-medium">
                    Anchor day of month
                  </label>
                  <Input
                    id="anchor"
                    inputMode="numeric"
                    value={anchorDay}
                    onChange={(e) => setAnchorDay(e.target.value)}
                    className="tabular-nums"
                  />
                  {/* FR-501: anchor 31 in a 30-day month lands on the last day
                      and does NOT spill into the next month. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Day 31 lands on the last day of a shorter month
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Visit schedule — how often someone goes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {RECURRENCES.map((option) => (
                    <Chip
                      key={option}
                      label={RECURRENCE_LABEL[option]}
                      selected={recurrence === option}
                      onClick={() => setRecurrence(option)}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {/* The number that stops "alternate monthly" being read as 12. */}
                  {RECURRENCE_LABEL[recurrence]} → {visits} visits a year
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Billing frequency — how often they are invoiced
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {BILLING_FREQUENCIES.map((option) => (
                    <Chip
                      key={option}
                      label={BILLING_LABEL[option]}
                      selected={billing === option}
                      onClick={() => setBilling(option)}
                    />
                  ))}
                </div>
                {/*
                  FR-505's whole point, said in one line: this is an independent
                  axis from the visit schedule.
                */}
                <p className="text-xs text-muted-foreground">
                  Independent of the visit schedule — monthly visits with one
                  yearly invoice is the commonest combination in this market.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coverage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-col gap-1.5">
                  {COVERAGES.map((option) => (
                    <Chip
                      key={option}
                      label={COVERAGE_LABEL[option]}
                      selected={coverage === option}
                      onClick={() => setCoverage(option)}
                    />
                  ))}
                </div>
                {/* FR-504: coverage decides whether a consumed part becomes a
                    billable line, so it is stated here, not discovered later. */}
                <p className="text-xs text-muted-foreground">
                  {coverage === "COMPREHENSIVE"
                    ? "Parts consumed on a visit are recorded as cost and produce no billable line."
                    : "Parts consumed are billed at the contract's agreed price list, taxed at their own HSN rate."}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ---------------- What you just agreed ---------------- */}
          <div className="space-y-4">
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="text-base">What this means</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="flex items-start gap-2">
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  {/* The sentence the owner is actually deciding. */}
                  <span className="tabular-nums">
                    <strong>{visits} visits</strong> a year ·{" "}
                    <strong>
                      {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}
                    </strong>
                    {hasValue ? (
                      <>
                        {" "}
                        of <MoneyText amount={perInvoice} />
                      </>
                    ) : null}
                  </span>
                </p>

                <Separator />

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Annual value</span>
                  {/* Em-dash until a real figure exists (§6.3). */}
                  {hasValue ? (
                    <MoneyText amount={asPaise(annualPaise)} />
                  ) : (
                    <span className="text-muted-foreground">{EM_DASH}</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per invoice</span>
                  {hasValue ? (
                    <MoneyText amount={perInvoice} />
                  ) : (
                    <span className="text-muted-foreground">{EM_DASH}</span>
                  )}
                </div>

                {needsReceiptVoucher(billing) ? (
                  <>
                    <Separator />
                    {/*
                      FR-810: money received before the service is performed is
                      an advance for a service — taxable on receipt, and it needs
                      a sequentially-numbered Receipt Voucher. Surfaced here
                      because the accountant should not discover it at filing.
                    */}
                    <p className="rounded-md bg-warning/15 p-2 text-xs text-brand-brown">
                      Billed before the work is done, so GST falls due on
                      receipt. A Receipt Voucher is issued and the advance is
                      reported in GSTR-1 until the invoice adjusts it.
                    </p>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-2">
              {/*
                FR-501: "a contract without a schedule generates nothing" — and
                a contract without a value generates invoices for nothing. Both
                are required before this contract can start producing work, so
                the control states the missing piece rather than failing later.
              */}
              {canCreate ? (
                <Button
                  className="w-full"
                  onClick={() => {
                    dispatch({
                      type: "CREATE_CONTRACT",
                      customer,
                      site,
                      annualValuePaise: annualPaise,
                      coverage,
                      recurrence,
                      billing,
                      anchorDay: Number(anchorDay) || 1,
                      fromLeadReference: fromLead,
                    });
                    router.push("/contracts");
                  }}
                >
                  Create contract &amp; generate visits
                </Button>
              ) : (
                <>
                  <Button className="w-full" disabled>
                    Create contract &amp; generate visits
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {missing.join(" · ")} still needed.
                  </p>
                </>
              )}
              <Button
                variant="outline"
                className="w-full"
                render={<Link href="/contracts" />}
                nativeButton={false}
              >
                Save as draft
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
