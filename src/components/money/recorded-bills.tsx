"use client";

import Link from "next/link";
import { Plus, ReceiptText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/panel";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  clockFor,
  deductionAtRiskPaise,
  deductionLostPaise,
} from "@/lib/data/purchases";
import { useDispatch, useStoreState } from "@/lib/data/use-store";

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
  const state = useStoreState();
  const dispatch = useDispatch();
  const now = new Date();

  const bills = state.purchases;
  const atRisk = deductionAtRiskPaise(bills, state.vendors, now);
  const lost = deductionLostPaise(bills, state.vendors, now);

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
      {bills.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nothing recorded yet. A bill entered here starts its own §43B(h) clock.
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
            const vendor = state.vendors.find((entry) => entry.id === bill.vendorId);
            const clock = vendor ? clockFor(bill, vendor, now) : null;

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
                    onClick={() =>
                      dispatch({ type: "MARK_PURCHASE_PAID", billId: bill.id })
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
