"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, WhyDisabled } from "@/components/shared/field";
import { MoneyText } from "@/components/shared/money-text";
import { requiredName, rupees, validate } from "@/lib/validate";
import { asPaise } from "@/lib/money";
import { advanceTax } from "@/lib/data/advances";
import { getCustomers, type Customer } from "@/lib/data/customers";
import { recordAdvance } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";
import { cn } from "@/lib/utils";

/**
 * Record an advance - FR-810.
 *
 * **The one decision:** *how much came in, and is it within the state?* Nothing
 * else is asked, because nothing else changes the document. The rate is the
 * service rate, the date is today, and the voucher number is the software's job
 * rather than the reader's.
 *
 * A page, not a dialog, for the same reason every other form here is: the split
 * has to be readable while it is being decided, and a receipt is a document
 * somebody will be asked about later.
 */
const ADVANCE_FORM = z.object({
  customer: requiredName("A customer"),
  amount: rupees("The amount received"),
});

export function RecordAdvanceForm() {
  const router = useRouter();
  const record = useMutation(recordAdvance);

  /*
    The picker is loaded from the register, not typed.

    This field used to be free text, which meant an advance could be recorded
    against a name that matched no customer — and an advance that cannot be
    adjusted against that customer's invoice is money the ledger cannot
    explain. §31(3)(d) makes the receipt a document in its own right; it has
    to point at somebody real.
  */
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getCustomers().then((query) => {
      if (!cancelled && query.status === "ready") setCustomers(query.data.customers);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [head, setHead] = useState<"CGST_SGST" | "IGST">("CGST_SGST");

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) =>
    setTouched((prev) => new Set(prev).add(field));
  const check = validate(
    ADVANCE_FORM,
    { customer, amount },
    touched as ReadonlySet<"customer" | "amount">,
  );

  const receiptPaise = Math.round(Number(amount.replace(/,/g, "")) * 100);
  const hasAmount = Number.isFinite(receiptPaise) && receiptPaise > 0;
  const tax = advanceTax(hasAmount ? receiptPaise : 0, 18, head);

  const today = new Date();
  /*
    The voucher number is no longer previewed.

    It used to be peeked from a browser counter so the screen could show it
    before saving. The number is issued by `next_in_series()` on the server —
    showing one and taking another is exactly how a statutory series grows a
    hole (FR-811), and a preview that two laptops disagree about is worse than
    no preview at all.
  */

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
          breadcrumb={[{ label: "Money", href: "/money" }, { label: "Advances" }]}
          className="mb-4"
          title="Record an advance"
          description="Money in before the work. GST falls due on receipt, so this issues a Receipt Voucher."
        />

        {record.error ? (
          <div className="mb-4 max-w-4xl">
            <ErrorState error={record.error} onRetry={record.reset} />
          </div>
        ) : null}

        <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What came in</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="advance-customer" className="text-sm font-medium">
                  Customer
                </label>
                <select
                  id="advance-customer"
                  value={customer}
                  onChange={(event) => setCustomer(event.target.value)}
                  onBlur={() => touch("customer")}
                  aria-invalid={check.errors.customer !== undefined}
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
                    check.errors.customer && "border-destructive",
                  )}
                >
                  <option value="">Pick a customer</option>
                  {customers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                {check.errors.customer ? (
                  <p className="text-xs text-destructive">{check.errors.customer}</p>
                ) : null}
              </div>
              <Field
                label="Amount received (INR)"
                inputMode="numeric"
                className="tabular-nums"
                value={amount}
                onChange={setAmount}
                onBlur={() => touch("amount")}
                error={check.errors.amount}
                hint="What the customer actually paid, tax included"
              />

              <div>
                <p className="mb-1.5 text-sm font-medium">Place of supply</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    label="Within the state"
                    selected={head === "CGST_SGST"}
                    onClick={() => setHead("CGST_SGST")}
                  />
                  <Chip
                    label="Another state"
                    selected={head === "IGST"}
                    onClick={() => setHead("IGST")}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Decides whether the tax splits into CGST and SGST or sits
                  whole on IGST - the same derivation an invoice makes
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-base">The voucher this issues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-start gap-2">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                {/*
                  Its own series, shown before the fact. An RV sharing the
                  invoice counter breaks both series, and the break is only
                  found at filing.
                */}
                <span>
                  A <strong>Receipt Voucher</strong> is issued on save, from a
                  series separate from your invoices. The number comes from the
                  register itself, so two people recording at once cannot both
                  take it.
                </span>
              </p>

              <Separator />

              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable value</span>
                <MoneyText amount={asPaise(tax.taxablePaise)} />
              </div>
              {head === "IGST" ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGST 18%</span>
                  <MoneyText amount={asPaise(tax.igstPaise ?? 0)} />
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST 9%</span>
                    <MoneyText amount={asPaise(tax.cgstPaise ?? 0)} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST 9%</span>
                    <MoneyText amount={asPaise(tax.sgstPaise ?? 0)} />
                  </div>
                </>
              )}

              <Separator />

              <div className="flex justify-between font-medium">
                <span>Received</span>
                <MoneyText amount={asPaise(hasAmount ? receiptPaise : 0)} />
              </div>

              {/*
                The tax is inside the receipt, not on top of it - the customer
                has not separately handed over 18%.
              */}
              <p className="rounded-md bg-warning-bg p-2 text-xs text-muted-foreground">
                The tax is taken out of what was received, not added to it. It
                stays reported until an invoice adjusts this voucher.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex max-w-4xl flex-wrap items-center gap-2">
          <Button
            disabled={!check.ok || record.pending}
            onClick={async () => {
              const result = await record.run({
                customerId: customer,
                receiptPaise,
                // The service rate. The head (CGST+SGST or IGST) is derived
                // server-side from place of supply rather than sent, so the
                // screen cannot disagree with the register about it.
                ratePercent: 18,
                receivedOn: today.toISOString().slice(0, 10),
                contractId: null,
              });
              if (result?.ok) router.push("/money");
            }}
          >
            {record.pending ? "Recording…" : "Record advance & issue voucher"}
          </Button>
          <Button variant="outline" render={<Link href="/money" />} nativeButton={false}>
            Cancel
          </Button>
          <WhyDisabled reasons={check.summary} />
        </div>
      </div>
    </AppShell>
  );
}
