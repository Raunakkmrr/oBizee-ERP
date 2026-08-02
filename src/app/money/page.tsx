"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Phone, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { usePersistedChoice } from "@/lib/persisted-choice";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import {
  AGEING_BUCKETS,
  MSME_LABEL,
  ageingTotals,
  bucketFor,
  countdownFor,
  deductionAtRiskPaise,
  splitByPromise,
  getMoney,
  type AgeingBucket,
  type MoneyData,
  type Payable,
  type Receivable,
} from "@/lib/data/money";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * Money — PRD §6.12. Two sides, one screen.
 *
 * **The one decision on receivables:** *who do I chase, and who have I already
 * been promised?* **On payables:** *which bill costs me a deduction if I let it
 * slip?*
 *
 * §6.12.4: the toggle remembers the last-used side per user, "because the
 * accountant lives on one side and the owner on the other".
 */

const SIDE_KEY = "obez.money.side";
/** Module-level so the array identity is stable across renders. */
const SIDES = ["receivables", "payables"] as const;

/* ------------------------------------------------------------ receivables */

function AgeingStrip({
  rows,
  active,
  onPick,
}: {
  rows: Receivable[];
  active: AgeingBucket | null;
  onPick: (bucket: AgeingBucket | null) => void;
}) {
  const totals = ageingTotals(rows);
  return (
    // At 390px this becomes a horizontally scrollable chip row (§6.12.5) —
    // never a wrapped grid that pushes the first invoice below the fold.
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {AGEING_BUCKETS.map((bucket) => {
        const cell = totals[bucket];
        const selected = active === bucket;
        const empty = cell.count === 0;
        return (
          <button
            key={bucket}
            type="button"
            aria-pressed={selected}
            // An empty band is not a filter — selecting it can only produce an
            // empty list, so it is not offered as a control.
            disabled={empty}
            onClick={() => onPick(selected ? null : bucket)}
            className={cn(
              "min-w-[124px] shrink-0 rounded-lg border p-2.5 text-left transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              empty
                ? "border-dashed border-border bg-card"
                : selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-muted/60",
            )}
          >
            <p className="text-xs text-muted-foreground">{bucket} days</p>
            {/*
              An empty band renders an em-dash, never `₹0.00`. The figure is
              scanned, not read: a rupee amount in a row of rupee amounts reads
              as money owed, and the eye does not stop to notice it is zero.
              The count below carries the fact in words.
            */}
            {empty ? (
              <span className="block text-base font-semibold text-muted-foreground">
                {EM_DASH}
              </span>
            ) : (
              <MoneyText
                amount={asPaise(cell.paise)}
                className="block text-base font-semibold"
              />
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {cell.count} invoice{cell.count === 1 ? "" : "s"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function ReceivableRow({
  row,
  primary,
}: {
  row: Receivable;
  primary: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 text-sm last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{row.customer}</span>
          <span className="text-xs text-muted-foreground tnum-id">
            {row.invoiceNumber}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.invoiceDate}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {row.lastContact ?? "No contact logged"}
        </p>
      </div>

      {/* Days overdue as a word, never a bare integer (§6.12.1). */}
      <span className="shrink-0 text-xs text-brand-brown tabular-nums">
        {row.daysOverdue} days late
      </span>

      <MoneyText
        amount={asPaise(row.amountPaise)}
        className="w-28 shrink-0 text-right font-medium"
      />

      <div className="flex shrink-0 items-center gap-1">
        {row.promise !== null && !row.promise.broken ? (
          // FR-904: no reminder button at all. The restraint has to be visible,
          // otherwise it reads as a missing feature.
          <Badge variant="outline" className="text-xs">
            Promised {row.promise.dateWord}
          </Badge>
        ) : (
          <Button
            variant={primary ? "default" : "outline"}
            size="sm"
            aria-label={`Send WhatsApp reminder to ${row.customer}`}
          >
            <MessageCircle className="size-3.5" />
            Remind
          </Button>
        )}
        <Button variant="outline" size="sm">
          <Phone className="size-3.5" />
          Log call
        </Button>
      </div>
    </div>
  );
}

function Receivables({ data }: { data: MoneyData }) {
  const [filter, setFilter] = useState<AgeingBucket | null>(null);
  const visible = filter
    ? data.receivables.filter((r) => bucketFor(r.daysOverdue) === filter)
    : data.receivables;
  const { chase, promised } = splitByPromise(visible);
  const totalOverdue = data.receivables.reduce(
    (sum, r) => sum + r.amountPaise,
    0,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <MoneyText
          amount={asPaise(totalOverdue)}
          className="font-semibold"
        />{" "}
        <span className="text-muted-foreground">
          overdue across {data.receivables.length} invoices
        </span>
      </p>

      <AgeingStrip
        rows={data.receivables}
        active={filter}
        onPick={setFilter}
      />

      {chase.length > 0 ? (
        <div>
          <p className="mb-1 px-1 text-sm font-medium">
            To chase{" "}
            <span className="text-muted-foreground tabular-nums">
              ({chase.length})
            </span>
          </p>
          <Card className="gap-0 overflow-hidden py-0">
            {chase.map((row, index) => (
              // §6.12.4: one filled Remind, on the top row of the chase queue.
              <ReceivableRow key={row.id} row={row} primary={index === 0} />
            ))}
          </Card>
        </div>
      ) : (
        <Card className="p-6 text-sm">
          {/* §6.12.3: never a bare zero — the upcoming figure is the answer. */}
          No overdue invoices to chase.{" "}
          <MoneyText amount={asPaise(data.dueNext15Paise)} /> is due in the next
          15 days.
        </Card>
      )}

      {promised.length > 0 ? (
        <div>
          <p className="mb-1 px-1 text-sm font-medium">
            Promised{" "}
            <span className="text-muted-foreground tabular-nums">
              ({promised.length})
            </span>
          </p>
          {/* The reason, stated once — it is the restraint, not an oversight. */}
          <p className="mb-1 px-1 text-xs text-muted-foreground">
            Excluded from reminders while the promise holds. Auto-chasing someone
            who has already promised is how relationships get damaged.
          </p>
          <Card className="gap-0 overflow-hidden py-0">
            {promised.map((row) => (
              <ReceivableRow key={row.id} row={row} primary={false} />
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- payables */

function PayableRow({ bill, primary }: { bill: Payable; primary: boolean }) {
  const countdown = countdownFor(bill);
  return (
    <div className="border-b px-3 py-2.5 text-sm last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{bill.vendor}</span>
            {/* MSME class as a word on every row (§6.12.2). */}
            <Badge variant="outline" className="text-xs">
              {MSME_LABEL[bill.msmeClass]}
            </Badge>
            <span className="text-xs text-muted-foreground tnum-id">
              {bill.udyamNumber ?? "No Udyam number on record"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {bill.billDate}
          </p>
        </div>

        <MoneyText
          amount={asPaise(bill.amountPaise)}
          className="w-28 shrink-0 text-right font-medium"
        />

        <div className="flex shrink-0 gap-1">
          {countdown.kind === "unknown" ? (
            <Button variant="outline" size="sm">
              Verify Udyam status
            </Button>
          ) : (
            <>
              <Button variant={primary ? "default" : "outline"} size="sm">
                Mark paid
              </Button>
              {countdown.kind === "counting" && !bill.hasWrittenAgreement ? (
                // Attaching an agreement moves the limit from 15 to 45 — the
                // action is offered exactly where the 15 is shown.
                <Button variant="outline" size="sm">
                  Attach agreement
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {countdown.kind === "counting" ? (
        <div className="mt-2 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs tabular-nums">
              Day {countdown.day} of {countdown.limit}
            </span>
            <span className="text-xs text-muted-foreground">
              {countdown.basis}
            </span>
          </div>
          {/* Segmented, one cell per day, so "how much room is left" is
              countable rather than estimated from a bar's length. */}
          <div
            className="flex gap-px"
            role="img"
            aria-label={`Day ${countdown.day} of ${countdown.limit}. ${countdown.basis}`}
          >
            {Array.from({ length: countdown.limit }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-[1px]",
                  i < countdown.day
                    ? countdown.day > countdown.limit
                      ? "bg-destructive"
                      : "bg-brand-brown"
                    : "bg-muted",
                )}
              />
            ))}
          </div>
          {countdown.day > countdown.limit ? (
            <p className="text-xs text-destructive">
              Past the limit — this expense is no longer deductible this year.
            </p>
          ) : null}
        </div>
      ) : (
        // A suppressed or unknown countdown says why, in words. It must never
        // look like a comfortable one.
        <p className="mt-1.5 text-xs text-muted-foreground">
          {countdown.reason}
        </p>
      )}
    </div>
  );
}

function Payables({ data }: { data: MoneyData }) {
  const atRisk = deductionAtRiskPaise(data.payables);
  const unverified = data.payables.filter(
    (b) => countdownFor(b).kind === "unknown",
  );
  const rest = data.payables.filter((b) => countdownFor(b).kind !== "unknown");
  // Closest to its limit first — that is the row the primary action belongs on.
  const ordered = [...rest].sort((a, b) => {
    const ca = countdownFor(a);
    const cb = countdownFor(b);
    const left = (c: ReturnType<typeof countdownFor>) =>
      c.kind === "counting" ? c.limit - c.day : Number.POSITIVE_INFINITY;
    return left(ca) - left(cb);
  });

  return (
    <div className="space-y-3">
      {/* The sentence that is the entire reason this tab exists. */}
      <p className="text-sm">
        <MoneyText amount={asPaise(atRisk)} className="font-semibold" />{" "}
        <span className="text-muted-foreground">
          of deductions are at risk this month
        </span>
      </p>

      {data.udyamVerifiedAsOf ? (
        // §6.12.3's partial state: a stored status with a date is honest.
        <p className="text-xs text-muted-foreground">
          Udyam status saved as of {data.udyamVerifiedAsOf}.
        </p>
      ) : null}

      {unverified.length > 0 ? (
        <div>
          {/* Above the fold on purpose — an unverified vendor is an
              unquantified risk, not a zero one. */}
          <p className="mb-1 px-1 text-sm font-medium">
            Can&apos;t calculate — Udyam status unknown{" "}
            <span className="text-muted-foreground tabular-nums">
              ({unverified.length})
            </span>
          </p>
          <Card className="gap-0 overflow-hidden py-0">
            {unverified.map((bill) => (
              <PayableRow key={bill.id} bill={bill} primary={false} />
            ))}
          </Card>
        </div>
      ) : null}

      <div>
        <p className="mb-1 px-1 text-sm font-medium">Vendor bills</p>
        <Card className="gap-0 overflow-hidden py-0">
          {ordered.map((bill, index) => (
            <PayableRow key={bill.id} bill={bill} primary={index === 0} />
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function MoneyPage() {
  const [query, setQuery] = useState<Query<MoneyData>>(loading());
  // §6.12.4: the toggle remembers the last-used side per user.
  const [side, pick] = usePersistedChoice(SIDE_KEY, SIDES, "receivables");

  useEffect(() => {
    let cancelled = false;
    getMoney().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-3"
          title="Money"
          description="Who owes us, and which bill costs a deduction if it slips."
          actions={
            // Secondary. §6.12.4 names this screen's primary explicitly:
            // [Send WhatsApp reminder] on the top row of the chase queue (and
            // [Mark paid] on the payables side). Filling this button too would
            // put two primaries on screen — §6.13.2 calls that a defect.
            <Button
              variant="outline"
              render={<Link href="/money/new" />}
              nativeButton={false}
            >
              <Plus className="size-4" />
              New invoice
            </Button>
          }
        />

        {/* Two full-width tabs at 390px (§6.12.5), never a dropdown of views. */}
        <div className="mb-3 flex items-center gap-1 border-b">
          {SIDES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={side === value}
              onClick={() => pick(value)}
              className={cn(
                "-mb-px flex-1 border-b-2 px-3 py-2 text-sm transition-colors sm:flex-none",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                side === value
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "receivables" ? "They owe us" : "We owe them"}
            </button>
          ))}
        </div>

        <QueryBoundary query={query} label="money" loadingRows={6}>
          {(data) =>
            side === "receivables" ? (
              <Receivables data={data} />
            ) : (
              <Payables data={data} />
            )
          }
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
