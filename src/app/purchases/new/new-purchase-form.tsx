"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, ShieldAlert } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, WhyDisabled } from "@/components/shared/field";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requiredName, rupees, validate } from "@/lib/validate";
import { SLABS } from "@/lib/data/rates";
import { msmedApplies } from "@/lib/data/vendors";
import { TDS_SECTIONS, TDS_SECTION_LABEL, adviseTds, billTotals, getVendorBills, reverseChargeFor, suggestSection, type PurchaseBill } from "@/lib/data/purchases";
import { getVendors, type Vendor } from "@/lib/data/vendors";
import { recordPurchaseBill } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * Record a vendor bill — FR-705, FR-807, FR-906, and the start of FR-905's clock.
 *
 * **Three things this screen refuses to do quietly.** It will not add reverse
 * charge without saying so, because that is a liability the owner did not know
 * he had. It will not deduct TDS under §194J on a maintenance contract, which
 * is this industry's commonest deduction error and hands 8% of every bill to
 * the department for a year. And it will not start a §43B(h) clock without
 * showing the date it runs out.
 *
 * Everything is proposed with its reason and confirmed by a person. The
 * software's job here is to make the wrong answer visible, not to pick.
 */
const PURCHASE_FORM = z.object({
  vendorId: z.string().min(1, "Pick the vendor this bill came from"),
  vendorBillNumber: requiredName("The vendor's bill number"),
  billDate: z.string().min(1, "The bill date starts the payment clock"),
  description: requiredName("A description"),
  taxable: rupees("The taxable value"),
});

export function NewPurchaseForm() {
  const record = useMutation(recordPurchaseBill);

  /*
    From the register, not the browser. Reverse charge and the 43B(h) limit are
    properties of the vendor — their GSTIN decides whether §9(4) applies, and a
    written agreement decides 15 days or 45. A stale local copy tells somebody
    the wrong date to pay by.
  */
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getVendors(), getVendorBills()]).then(([vendorQuery, billQuery]) => {
      if (cancelled) return;
      if (vendorQuery.status === "ready") setVendors([...vendorQuery.data.vendors]);
      if (billQuery.status === "ready") setBills(billQuery.data.bills);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const router = useRouter();

  const [vendorId, setVendorId] = useState("");
  const [vendorBillNumber, setVendorBillNumber] = useState("");
  const [billDate, setBillDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
  });
  const [description, setDescription] = useState("");
  const [taxable, setTaxable] = useState("");
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [tdsSection, setTdsSection] = useState<(typeof TDS_SECTIONS)[number] | null>(
    null,
  );
  const [reverseChargeConfirmed, setReverseChargeConfirmed] = useState<boolean | null>(
    null,
  );

  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = (field: string) =>
    setTouched((previous) => new Set(previous).add(field));

  const check = validate(
    PURCHASE_FORM,
    { vendorId, vendorBillNumber, billDate, description, taxable },
    touched as ReadonlySet<
      "vendorId" | "vendorBillNumber" | "billDate" | "description" | "taxable"
    >,
  );

  const vendor = vendors.find((entry) => entry.id === vendorId) ?? null;
  const taxablePaise = Math.round(Number(taxable.replace(/,/g, "")) * 100) || 0;

  /* Proposed, never applied — the reader confirms both. */
  const rcAdvice = vendor ? reverseChargeFor(vendor) : null;
  const reverseCharge = reverseChargeConfirmed ?? rcAdvice?.applies ?? false;
  const section = tdsSection ?? suggestSection(description);

  /*
    What this vendor has already been paid, from the register.

    §194C's ₹1,00,000 annual threshold is cumulative, so the answer to "does
    TDS apply to this bill" depends on every earlier bill. Reading a local
    array meant a second machine's entries were invisible and the form advised
    "no TDS" on a bill that crossed the limit.
  */
  const paidThisYear = bills
    .filter((bill) => bill.vendorId === vendorId)
    .reduce((sum, bill) => sum + bill.taxablePaise, 0);

  const tds = vendor
    ? adviseTds(section, taxablePaise, vendor, paidThisYear)
    : null;
  const tdsPaise = tds?.kind === "deduct" ? tds.amountPaise : 0;

  const totals = billTotals({
    taxablePaise,
    gstPercent,
    reverseCharge,
    tdsPaise,
  });

  const msmed = vendor ? msmedApplies(vendor) : null;
  const dueBy =
    msmed?.applies && billDate
      ? new Date(
          new Date(`${billDate}T00:00:00`).getTime() + msmed.limitDays * 86_400_000,
        ).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : null;

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/money" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to money
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Money", href: "/money" }]}
          className="mb-4"
          title="Record a vendor bill"
          description="What they billed, what you withhold, and when it has to be paid."
        />

        <div className="grid max-w-5xl gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">The bill</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label htmlFor="pb-vendor" className="mb-1.5 block text-sm font-medium">
                    Vendor
                  </label>
                  <select
                    id="pb-vendor"
                    value={vendorId}
                    onChange={(event) => {
                      setVendorId(event.target.value);
                      // A new vendor means a new reverse-charge answer.
                      setReverseChargeConfirmed(null);
                    }}
                    onBlur={() => touch("vendorId")}
                    aria-invalid={check.errors.vendorId !== undefined}
                    className={cn(
                      "h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
                      check.errors.vendorId && "border-destructive",
                    )}
                  >
                    <option value="">Pick a vendor</option>
                    {vendors.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                  {check.errors.vendorId ? (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {check.errors.vendorId}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Not listed?{" "}
                      <Link href="/vendors/new" className="underline">
                        Add them first
                      </Link>
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Their bill number"
                    className="tnum-id"
                    value={vendorBillNumber}
                    onChange={setVendorBillNumber}
                    onBlur={() => touch("vendorBillNumber")}
                    error={check.errors.vendorBillNumber}
                    hint="Theirs, not ours — this is an inward document"
                  />
                  <Field
                    label="Bill date"
                    type="date"
                    className="tabular-nums"
                    value={billDate}
                    onChange={setBillDate}
                    onBlur={() => touch("billDate")}
                    error={check.errors.billDate}
                  />
                </div>

                <Field
                  label="What it was for"
                  value={description}
                  onChange={setDescription}
                  onBlur={() => touch("description")}
                  error={check.errors.description}
                  placeholder="Generator AMC — quarterly labour"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Taxable value (₹)"
                    inputMode="numeric"
                    className="tabular-nums"
                    value={taxable}
                    onChange={setTaxable}
                    onBlur={() => touch("taxable")}
                    error={check.errors.taxable}
                  />
                  <div>
                    <p className="mb-1.5 text-sm font-medium">GST</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SLABS.map((slab) => (
                        <Chip
                          key={slab}
                          label={`${slab}%`}
                          selected={gstPercent === slab}
                          onClick={() => setGstPercent(slab)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {rcAdvice ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reverse charge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* FR-807 — flagged with its reason, then confirmed. */}
                  <p
                    className={cn(
                      "flex items-start gap-2 rounded-lg p-2.5 text-xs",
                      rcAdvice.applies ? "bg-warning-bg" : "bg-muted-bg",
                    )}
                  >
                    <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span>{rcAdvice.reason}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip
                      label="Reverse charge applies"
                      selected={reverseCharge}
                      onClick={() => setReverseChargeConfirmed(true)}
                    />
                    <Chip
                      label="Vendor charges the GST"
                      selected={!reverseCharge}
                      onClick={() => setReverseChargeConfirmed(false)}
                    />
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">TDS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-col gap-1.5">
                  {TDS_SECTIONS.map((option) => (
                    <Chip
                      key={option}
                      label={TDS_SECTION_LABEL[option]}
                      selected={section === option}
                      onClick={() => setTdsSection(option)}
                    />
                  ))}
                </div>
                {tds ? (
                  <p className="rounded-lg bg-muted-bg p-2.5 text-xs text-muted-foreground">
                    {/*
                      The reason, always. "2%" without "because they are a
                      company" is a number nobody can check.
                    */}
                    {tds.kind === "deduct"
                      ? `${tds.reason} — withholding ₹${(tds.amountPaise / 100).toLocaleString("en-IN")}`
                      : tds.reason}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-base">What you owe them</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable value</span>
                <MoneyText amount={asPaise(taxablePaise)} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  GST {gstPercent}%{reverseCharge ? " — you remit" : ""}
                </span>
                <MoneyText amount={asPaise(totals.gstPaise)} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TDS withheld</span>
                <span>
                  {tdsPaise > 0 ? "− " : ""}
                  <MoneyText amount={asPaise(tdsPaise)} />
                </span>
              </div>

              <Separator />

              <div className="flex justify-between text-base font-medium">
                <span>Pay the vendor</span>
                <MoneyText amount={asPaise(totals.payablePaise)} />
              </div>

              {reverseCharge ? (
                <p className="rounded-md bg-warning-bg p-2 text-xs">
                  The GST is not paid to them — you remit it and claim it back.
                </p>
              ) : null}

              {dueBy ? (
                <p className="flex items-start gap-2 rounded-md bg-destructive-bg p-2 text-xs">
                  <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Pay by <strong>{dueBy}</strong> or the deduction for this
                    expense is lost for the year.
                  </span>
                </p>
              ) : msmed && !msmed.applies && vendor ? (
                <p className="rounded-md bg-muted-bg p-2 text-xs text-muted-foreground">
                  {msmed.reason}
                </p>
              ) : null}

              {record.error ? (
                <div className="pb-2">
                  <ErrorState error={record.error} onRetry={record.reset} />
                </div>
              ) : null}

              <div className="space-y-2 pt-1">
                <Button
                  className="w-full"
                  disabled={!check.ok || record.pending}
                  onClick={async () => {
                    /*
                      `tdsPaise` is not sent. The register recomputes the
                      deduction from the section, the amount and the vendor —
                      a screen that posts its own figure is a second opinion on
                      a statutory number, and the two would eventually differ.
                    */
                    const result = await record.run({
                      vendorId,
                      vendorBillNumber: vendorBillNumber.trim(),
                      billDate,
                      description: description.trim(),
                      taxablePaise,
                      gstPercent,
                      reverseCharge,
                      tdsSection: section,
                    });
                    if (result?.ok) router.push("/money");
                  }}
                >
                  Record the bill
                </Button>
                <WhyDisabled reasons={check.summary} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
