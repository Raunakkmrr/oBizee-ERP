"use client";

import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/panel";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { advanceTax, getAdvances, getSettlementTargets, openAdvances, receivedWord, type AdvanceRow, type AdvancesData, type SettlementTarget } from "@/lib/data/advances";
import { useCallback, useEffect, useState } from "react";
import { loading, type Query } from "@/lib/data/result";
import { adjustAdvance } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

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
  const [query, setQuery] = useState<Query<AdvancesData>>(loading());
  const [targets, setTargets] = useState<SettlementTarget[]>([]);

  const reload = useCallback(() => {
    void getAdvances().then(setQuery);
    void getSettlementTargets().then((result) => {
      if (result.status === "ready") setTargets(result.data.invoices);
    });
  }, []);
  useEffect(reload, [reload]);

  const settle = useMutation(
    useCallback(
      async (id: string, invoiceId: string) => {
        const result = await adjustAdvance(id, invoiceId);
        // The voucher moves from open to closed and the tax-out figure with it.
        if (result.ok) reload();
        return result;
      },
      [reload],
    ),
  );

  const advances = query.status === "ready" ? query.data.advances : [];
  const open = openAdvances(advances);
  const closed = advances.filter((advance) => advance.status === "ADJUSTED");
  const taxOut = query.status === "ready" ? query.data.unadjustedTaxPaise : 0;

  /*
    The invoices *this customer* has. The panel used to offer whichever
    invoice was newest in the whole register, which is how an advance could be
    closed against a different customer's bill entirely — the register now
    refuses that, and this stops it being offered in the first place.
  */
  const targetsFor = (customerId: string) =>
    targets.filter((invoice) => invoice.customerId === customerId);

  return (
    <>
      {settle.error ? (
        <div className="mb-3">
          <ErrorState error={settle.error} onRetry={settle.reset} />
        </div>
      ) : null}
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
              targets={targetsFor(advance.customerId)}
              busy={settle.pending}
              onAdjust={(invoiceId) => void settle.run(advance.id, invoiceId)}
            />
          ))}
        </>
      )}
    </Panel>
    </>
  );
}

function AdvanceRow({
  advance,
  targets,
  busy,
  onAdjust,
}: {
  advance: AdvanceRow;
  /** This customer's own invoices — never the register's newest. */
  targets: SettlementTarget[];
  busy: boolean;
  onAdjust: (invoiceId: string) => void;
}) {
  const tax = advanceTax(advance.receiptPaise, advance.ratePercent, advance.head);
  const adjusted = advance.status === "ADJUSTED";
  // Defaults to the customer's newest bill, which is usually the right one.
  const [chosen, setChosen] = useState("");
  const picked = targets.some((invoice) => invoice.id === chosen)
    ? chosen
    : (targets[targets.length - 1]?.id ?? "");
  const setPicked = setChosen;

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
      ) : targets.length > 0 ? (
        /*
          Which invoice, chosen rather than assumed. One is preselected because
          that is the common case, but the list is this customer's own bills —
          the panel used to adjust into whichever invoice was newest anywhere
          in the register.
        */
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label={`Invoice to settle ${advance.voucherNumber} into`}
            value={picked}
            onChange={(event) => setPicked(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {targets.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.number}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !picked}
            onClick={() => onAdjust(picked)}
          >
            Adjust
          </Button>
        </div>
      ) : (
        // Never a dead control: the reason it cannot be adjusted is stated.
        <span className="shrink-0 text-xs text-muted-foreground">
          Nothing to adjust into yet — raise an invoice for {advance.customer} first
        </span>
      )}
    </div>
  );
}