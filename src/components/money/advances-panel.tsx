"use client";

import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/panel";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  advanceTax,
  openAdvances,
  receivedWord,
  unadjustedTaxPaise,
  type Advance,
} from "@/lib/data/advances";
import { useDispatch, useStoreState } from "@/lib/data/use-store";

/**
 * Advances received - FR-810.
 *
 * **Why this is on the money screen and not buried in a tax module.** The
 * figure that matters is *tax already paid on work not yet done*. It is real
 * money out of the bank, sitting against a service the firm still owes, and
 * nobody looking at "who owes us" would otherwise see it. Showing it beside the
 * receivables is what makes the cash position true rather than flattering.
 *
 * Each row carries its voucher number because that is the document a customer
 * or an auditor asks for by name, and a receipt with no number is exactly the
 * s.31(3)(d) failure this exists to prevent.
 */
export function AdvancesPanel() {
  const state = useStoreState();
  const dispatch = useDispatch();

  const advances = state.advances;
  const open = openAdvances(advances);
  const closed = advances.filter((advance) => advance.status === "ADJUSTED");
  const taxOut = unadjustedTaxPaise(advances);

  /** The most recent invoice - the only thing an advance can be adjusted into. */
  const latestInvoice = state.invoices[0] ?? null;

  return (
    <Panel
      title="Advances received"
      icon={HandCoins}
      count={open.length}
      caption={
        open.length > 0 ? "Oldest first - tax on these is already paid" : undefined
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          render={<Link href="/money/advances/new" />}
          nativeButton={false}
        >
          <Plus className="size-4" />
          Record one
        </Button>
      }
      flush
    >
      {advances.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nothing taken in advance. An upfront-billed AMC will show here.
        </p>
      ) : (
        <>
          {open.length > 0 ? (
            <div className="border-b border-border/60 bg-warning-bg px-4 py-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium">
                  GST already paid on work not yet done
                </span>
                <MoneyText
                  amount={asPaise(taxOut)}
                  className="font-semibold tracking-tight"
                />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Reported in GSTR-1 until an invoice adjusts it - the credit is
                claimed there, not re-taken here.
              </p>
            </div>
          ) : null}

          {[...open, ...closed].map((advance) => (
            <AdvanceRow
              key={advance.id}
              advance={advance}
              invoiceNumber={latestInvoice?.number ?? null}
              onAdjust={() => {
                if (!latestInvoice) return;
                dispatch({
                  type: "ADJUST_ADVANCE",
                  voucherNumber: advance.voucherNumber,
                  invoiceNumber: latestInvoice.number,
                });
              }}
            />
          ))}
        </>
      )}
    </Panel>
  );
}

function AdvanceRow({
  advance,
  invoiceNumber,
  onAdjust,
}: {
  advance: Advance;
  invoiceNumber: string | null;
  onAdjust: () => void;
}) {
  const tax = advanceTax(advance.receiptPaise, advance.ratePercent, advance.head);
  const adjusted = advance.status === "ADJUSTED";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-4 py-3 last:border-b-0",
        ROW_TR,
        adjusted && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{advance.customer}</p>
        <p className="truncate text-xs text-muted-foreground tnum-id">
          {advance.voucherNumber} &middot; {receivedWord(advance.receivedOn)} &middot;{" "}
          {advance.head === "IGST" ? "IGST" : "CGST + SGST"}{" "}
          {advance.ratePercent}%
        </p>
      </div>

      <div className="shrink-0 text-right">
        <MoneyText
          amount={asPaise(advance.receiptPaise)}
          className="text-sm font-medium"
        />
        {/*
          The split, because "4,24,800 received" is not the number the return
          needs - the taxable value and the tax inside it are.
        */}
        <p className="text-xs text-muted-foreground tabular-nums">
          value <MoneyText amount={asPaise(tax.taxablePaise)} /> &middot; tax{" "}
          <MoneyText amount={asPaise(tax.totalTaxPaise)} />
        </p>
      </div>

      {adjusted ? (
        <span className="shrink-0 rounded-md bg-success-bg px-2 py-0.5 text-xs font-medium text-success">
          Adjusted &middot; {advance.adjustedByInvoice}
        </span>
      ) : invoiceNumber ? (
        <Button size="sm" variant="outline" onClick={onAdjust}>
          Adjust into {invoiceNumber}
        </Button>
      ) : (
        // Never a dead control: the reason it cannot be adjusted is stated.
        <span className="shrink-0 text-xs text-muted-foreground">
          Nothing to adjust into yet - raise an invoice first
        </span>
      )}
    </div>
  );
}
