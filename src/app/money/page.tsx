"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CircleHelp,
  Clock,
  HandCoins,
  MessageCircle,
  Phone,
  Plus,
  ReceiptIndianRupee,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/shared/panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import {
  AGEING_BUCKETS,
  MSME_LABEL,
  ageingTotals,
  bucketFor,
  countdownFor,
  deductionAtRiskPaise,
  deductionLostPaise,
  moneyAlarms,
  splitByPromise,
  getMoney,
  type AgeingBucket,
  type MoneyAlarm,
  type MoneyData,
  type Payable,
  type Receivable,
} from "@/lib/data/money";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * Money — PRD §6.12. Two sides, **one screen, no tab**.
 *
 * **The one decision on receivables:** *who do I chase, and who have I already
 * been promised?* **On payables:** *which bill costs me a deduction if I let it
 * slip?*
 *
 * **What was wrong.** The two sides were tabs, and the §43B(h) clock lived on
 * the second one — so a deduction that had *already lapsed* was one click away
 * from never being seen. On the fixture that is ₹26,000 gone for the financial
 * year, hidden behind a tab. A deadline with a legal consequence and no undo
 * does not belong there.
 *
 * Worse, the headline above it read "₹64,200 of deductions are at risk", which
 * summed every running bill *including the lapsed one* — understating the loss
 * and overstating what could still be saved, on the one screen where that
 * distinction is the entire point. `Countdown` now has a separate `lapsed`
 * shape so the two can never be added together again.
 *
 * So the screen leads with an alarm band carrying only what is irreversible or
 * running out, and both sides sit below it as worklists. Receivables are
 * deliberately *not* alarms: an invoice ninety days late is bad, but it is bad
 * in a way the chase list already handles and that does not expire at midnight.
 * A band that is always full is a band nobody reads.
 *
 * ⚠️ **§6.12.4 deviation, deliberate.** That clause asks the side toggle to
 * remember its last position "because the accountant lives on one side and the
 * owner on the other". There is no toggle any more, so the requirement is met a
 * different way: neither of them has to switch, and neither can be shown a
 * screen that hides the other's half of the money.
 */

/* ------------------------------------------------------------------ alarms */

function AlarmRow({ alarm }: { alarm: MoneyAlarm }) {
  const tone =
    alarm.kind === "deduction_lost"
      ? "destructive"
      : alarm.kind === "deduction_due"
        ? "warning"
        : "muted";

  const Icon =
    alarm.kind === "deduction_lost"
      ? CircleAlert
      : alarm.kind === "deduction_due"
        ? Clock
        : CircleHelp;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted-bg p-3">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          tone === "destructive" && "text-destructive",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-muted-foreground",
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {alarm.kind === "deduction_lost" ? (
            <>
              Deduction lost — day {alarm.day} of {alarm.limit}
            </>
          ) : alarm.kind === "deduction_due" ? (
            <>
              {alarm.daysLeft} day{alarm.daysLeft === 1 ? "" : "s"} left to keep
              this deduction
            </>
          ) : (
            <>Udyam status unknown — the risk cannot be calculated</>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {alarm.bill.vendor} · {alarm.bill.billDate}
        </p>
      </div>

      <MoneyText
        amount={asPaise(alarm.bill.amountPaise)}
        className="shrink-0 font-medium"
      />

      <div className="flex shrink-0 gap-1.5">
        {alarm.kind === "unverified_vendor" ? (
          <Button size="sm" variant="outline">
            Verify Udyam status
          </Button>
        ) : alarm.kind === "deduction_due" ? (
          <>
            {/* The one action that still saves the money. */}
            <Button size="sm">Mark paid</Button>
            {!alarm.bill.hasWrittenAgreement ? (
              // Attaching an agreement moves the limit from 15 days to 45 —
              // offered exactly where the 15 is being counted against them.
              <Button size="sm" variant="outline">
                Attach agreement
              </Button>
            ) : null}
          </>
        ) : (
          // Nothing here saves the deduction; paying is still owed.
          <Button size="sm" variant="outline">
            Mark paid
          </Button>
        )}
      </div>
    </div>
  );
}

function AlarmBand({ data }: { data: MoneyData }) {
  const alarms = moneyAlarms(data.payables);
  if (alarms.length === 0) return null;

  const lost = deductionLostPaise(data.payables);
  const atRisk = deductionAtRiskPaise(data.payables);

  return (
    <section
      aria-label="Money alarms"
      className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">
          Needs you now
        </h2>
        {/*
          Two figures, never one. Already-lost money and still-savable money are
          different facts, and the sum of them is a number that helps nobody.
        */}
        {lost > 0 ? (
          <p className="text-sm">
            <MoneyText
              amount={asPaise(lost)}
              className="font-semibold text-destructive"
            />{" "}
            <span className="text-muted-foreground">
              already lost this year
            </span>
          </p>
        ) : null}
        {atRisk > 0 ? (
          <p className="text-sm">
            <MoneyText amount={asPaise(atRisk)} className="font-semibold" />{" "}
            <span className="text-muted-foreground">
              still savable by paying
            </span>
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {alarms.map((alarm) => (
          <AlarmRow key={alarm.bill.id} alarm={alarm} />
        ))}
      </div>

      {data.udyamVerifiedAsOf ? (
        // §6.12.3: a stored status with a date is honest; a silent one is not.
        <p className="mt-2.5 text-xs text-muted-foreground">
          Udyam status saved as of {data.udyamVerifiedAsOf}.
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ receivables */

/**
 * The ageing profile, as one line.
 *
 * It used to be six cards the width of the screen, above a chase list that was
 * already sorted by the thing that matters. Ageing answers "how bad is my
 * book", which is a monthly question; the chase list answers "who do I call
 * now", which is the reason the screen is open. So it keeps its filtering job
 * and gives up its real estate.
 */
function AgeingLine({
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
    /*
      Scrolls at 390px, wraps above it.

      §6.12.5 asks for a scrolling chip row rather than "a wrapped grid that
      pushes the first invoice below the fold" — written when these were
      six full-width cards. As chips a second line costs about thirty pixels,
      and scrolling on a wide screen hid the 90+ band entirely, which is the
      one bucket nobody should have to discover by dragging.
    */
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-x-visible">
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
              "shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              empty
                ? "text-muted-foreground/60"
                : selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-accent",
            )}
          >
            <span className="text-muted-foreground">{bucket}d </span>
            {/*
              An empty band renders an em-dash, never `₹0.00`. The figure is
              scanned, not read: a rupee amount in a row of rupee amounts reads
              as money owed, and the eye does not stop to notice it is zero.
            */}
            {empty ? (
              <span className="font-medium">{EM_DASH}</span>
            ) : (
              <MoneyText
                amount={asPaise(cell.paise)}
                className={cn(
                  "font-medium",
                  selected && "text-primary-foreground",
                )}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReceivableRow({ row, primary }: { row: Receivable; primary: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors odd:bg-muted-bg hover:bg-accent">
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
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <HandCoins className="size-4 text-warning" />
          They owe us
        </h2>
        <MoneyText
          amount={asPaise(totalOverdue)}
          className="text-lg font-semibold tracking-tight"
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          across {data.receivables.length} invoices · {chase.length} to chase,{" "}
          {promised.length} promised
        </p>
      </div>

      <AgeingLine rows={data.receivables} active={filter} onPick={setFilter} />

      {chase.length > 0 ? (
        <Panel
          title="To chase"
          icon={ReceiptIndianRupee}
          count={chase.length}
          caption="Ordered by amount × days late — neither alone gets this right"
          flush
        >
          {chase.map((row, index) => (
            // §6.12.4: one filled Remind, on the top row of the chase queue.
            <ReceivableRow key={row.id} row={row} primary={index === 0} />
          ))}
        </Panel>
      ) : (
        <Card className="p-6 text-sm">
          {/* §6.12.3: never a bare zero — the upcoming figure is the answer. */}
          No overdue invoices to chase.{" "}
          <MoneyText amount={asPaise(data.dueNext15Paise)} /> is due in the next
          15 days.
        </Card>
      )}

      {promised.length > 0 ? (
        <Panel
          title="Promised"
          icon={HandCoins}
          count={promised.length}
          // The reason, stated once — it is the restraint, not an oversight.
          caption="Excluded from reminders while the promise holds — auto-chasing someone who has already promised is how relationships get damaged"
          flush
        >
          {promised.map((row) => (
            <ReceivableRow key={row.id} row={row} primary={false} />
          ))}
        </Panel>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- payables */

function PayableRow({ bill }: { bill: Payable }) {
  const countdown = countdownFor(bill);
  const running = countdown.kind === "counting" || countdown.kind === "lapsed";

  return (
    <div className="px-4 py-3 text-sm odd:bg-muted-bg">
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
            <Button variant="outline" size="sm">
              Mark paid
            </Button>
          )}
        </div>
      </div>

      {running ? (
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
                    ? countdown.kind === "lapsed"
                      ? "bg-destructive"
                      : "bg-brand-brown"
                    : "bg-muted",
                )}
              />
            ))}
          </div>
          {countdown.kind === "lapsed" ? (
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
  const total = data.payables.reduce((sum, b) => sum + b.amountPaise, 0);
  // Closest to its limit first; the ones the timeline never touches sink.
  const ordered = [...data.payables].sort((a, b) => {
    const left = (bill: Payable) => {
      const countdown = countdownFor(bill);
      if (countdown.kind === "lapsed") return -1;
      if (countdown.kind === "counting") return countdown.limit - countdown.day;
      return Number.POSITIVE_INFINITY;
    };
    return left(a) - left(b);
  });

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <ReceiptIndianRupee className="size-4 text-primary-text" />
          We owe them
        </h2>
        <MoneyText
          amount={asPaise(total)}
          className="text-lg font-semibold tracking-tight"
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          across {data.payables.length} bills
        </p>
      </div>

      <Panel
        title="Vendor bills"
        icon={ReceiptIndianRupee}
        count={ordered.length}
        caption="Closest to its limit first"
        flush
      >
        {ordered.map((bill) => (
          <PayableRow key={bill.id} bill={bill} />
        ))}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ screen */

export default function MoneyPage() {
  const [query, setQuery] = useState<Query<MoneyData>>(loading());

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
      <div className="p-3 lg:p-4">
        <PageHeader
          breadcrumb={[{ label: "Money" }]}
          className="mb-4"
          title="Money"
          description="Who owes us, and which bill costs a deduction if it slips."
          actions={
            <Button render={<Link href="/money/new" />} nativeButton={false}>
              <Plus className="size-4" />
              New invoice
            </Button>
          }
        />

        <QueryBoundary query={query} label="the money screen" loadingRows={8}>
          {(data) => (
            <div className="space-y-5">
              <AlarmBand data={data} />
              <div className="grid gap-5 xl:grid-cols-2">
                <Receivables data={data} />
                <Payables data={data} />
              </div>
            </div>
          )}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
