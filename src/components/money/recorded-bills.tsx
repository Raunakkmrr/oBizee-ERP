"use client";

import Link from "next/link";
import { Plus, ReceiptText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/panel";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

import { useCallback, useEffect, useState } from "react";
import { getVendorBills, type VendorBills } from "@/lib/data/purchases";
import { loading, type Query } from "@/lib/data/result";
import { payPurchaseBill } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * Vendor bills recorded in this build — FR-705, and FR-905 on real data.
 *
 * **Two totals, never one.** Money still savable by paying today is a different
 * fact from money whose deduction is already gone, and adding them together
 * both understates the loss and overstates what can be rescued — on the one
 * panel where that distinction is the entire point.
 *
 * Sits beside the seeded payables rather than replacing them: those demonstrate
 * the ageing view, these are what the office actually entered.
 */
export function RecordedBills() {
  /*
    Read from the register, not the browser.

    Marking a bill paid now goes to the API, and a panel still reading a local
    array would leave the row on screen with its §37(2)(g) clock running against
    a bill that was settled — the exact contradiction this panel exists to
    prevent.

    The two deduction figures come from the API for the same reason: they are
    computed from the vendors' Udyam activity, and computing them twice is two
    chances to disagree about how much is already lost.
  */
  const [query, setQuery] = useState<Query<VendorBills>>(loading());
  const reload = useCallback(() => {
    void getVendorBills().then(setQuery);
  }, []);
  useEffect(reload, [reload]);

  // Refetch after settling: the row moves to PAID and both totals change.
  const pay = useMutation(
    useCallback(
      async (id: string, body: { paidOn: string }) => {
        const result = await payPurchaseBill(id, body);
        if (result.ok) reload();
        return result;
      },
      [reload],
    ),
  );

  const bills = query.status === "ready" ? query.data.bills : [];
  const atRisk = query.status === "ready" ? query.data.atRiskPaise : 0;
  const lost = query.status === "ready" ? query.data.lostPaise : 0;

  return (
    <Panel
      title="Vendor bills you recorded"
      icon={ReceiptText}
      count={bills.length}
      actions={
        <Button
          size="sm"
          variant="outline"
          render={<Link href="/purchases/new" />}
          nativeButton={false}
        >
          <Plus className="size-4" />
          Record a bill
        </Button>
      }
      flush
    >
      {pay.error ? (
        <div className="p-4">
          <ErrorState error={pay.error} onRetry={pay.reset} />
        </div>
      ) : null}
      {bills.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nothing recorded yet. A bill entered here starts its own §37(2)(g) clock.
        </p>
      ) : (
        <>
          {atRisk > 0 || lost > 0 ? (
            <div className="grid gap-px border-b border-border/60 bg-border/60 sm:grid-cols-2">
              <div className="bg-warning-bg px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  Deduction still savable by paying now
                </p>
                <MoneyText
                  amount={asPaise(atRisk)}
                  className="text-base font-semibold tracking-tight"
                />
              </div>
              <div className="bg-destructive-bg px-4 py-2.5">
                <p className="text-xs text-muted-foreground">
                  Already lost for this year
                </p>
                <MoneyText
                  amount={asPaise(lost)}
                  className="text-base font-semibold tracking-tight"
                />
              </div>
            </div>
          ) : null}

          {bills.map((bill) => {
            // Computed by the register — see `purchaseBillSchema.clock`.
            const clock = bill.clock ?? null;

            return (
              <div
                key={bill.id}
                className={cn(
                  "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-3 last:border-b-0",
                  ROW_TR,
                  bill.status === "PAID" && "opacity-70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {bill.vendorName}{" "}
                    <span className="text-muted-foreground tnum-id">
                      {bill.vendorBillNumber}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {bill.description}
                    {bill.tdsPaise > 0
                      ? ` · ${bill.tdsSection} withheld ₹${(bill.tdsPaise / 100).toLocaleString("en-IN")}`
                      : ""}
                  </p>
                </div>

                {bill.reverseCharge ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-md bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                    <ShieldAlert aria-hidden="true" className="size-3" />
                    RCM
                  </span>
                ) : null}

                {clock ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                      clock.kind === "lapsed" && "bg-destructive-bg text-destructive",
                      clock.kind === "counting" && "bg-warning-bg text-warning",
                      clock.kind === "paid" && "bg-success-bg text-success",
                      clock.kind === "not_applicable" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {clock.kind === "counting"
                      ? `${clock.daysLeft} days left of ${clock.limit}`
                      : clock.kind === "lapsed"
                        ? `Deduction lost — day ${clock.day} of ${clock.limit}`
                        : clock.kind === "paid"
                          ? "Paid"
                          : "No MSMED clock"}
                  </span>
                ) : null}

                <MoneyText
                  amount={asPaise(bill.payablePaise)}
                  className="shrink-0 text-sm font-medium"
                />

                {bill.status === "UNPAID" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={pay.pending}
                    onClick={() =>
                      void pay.run(bill.id, {
                        // TODO(FR-905): ask when it was paid. The API takes the
                        // real date and against a 15-day MSMED clock the
                        // difference between Friday and Monday is the answer.
                        paidOn: new Date().toISOString().slice(0, 10),
                      })
                    }
                  >
                    Mark paid
                  </Button>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </Panel>
  );
}
