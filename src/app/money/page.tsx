"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleHelp, Clock, HandCoins, IndianRupee, MessageCircle, Phone, Plus, ReceiptIndianRupee } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/shared/panel";
import { AdvancesPanel } from "@/components/money/advances-panel";
import { RecordedBills } from "@/components/money/recorded-bills";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import { AGEING_BUCKETS, MSME_LABEL, ageingTotals, bucketFor, countdownFor, deductionAtRiskPaise, deductionLostPaise, moneyAlarms, splitByPromise, isPartPaid, getMoney, type AgeingBucket, type MoneyAlarm, type BillablePeriod, type MoneyData, type Payable, type Receivable, getDueInvoices } from "@/lib/data/money";
import { Unavailable, NEEDS_BACKEND, NEEDS_UPLOAD } from "@/components/shared/unavailable";
import { telHref, whatsappHref } from "@/lib/contact";
import { useRouter } from "next/navigation";
import { createInvoice, payPurchaseBill } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

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

function AlarmRow({
  alarm,
  onPaid,
  busy,
}: {
  alarm: MoneyAlarm;
  onPaid: (billId: string) => void;
  busy: boolean;
}) {
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
          // A Udyam lookup is a call to a government register. There is no
          // honest way to fake it, so the control says so instead of pretending.
          <Unavailable label="Verify Udyam status" reason={NEEDS_BACKEND} />
        ) : alarm.kind === "deduction_due" ? (
          <>
            {/* The one action that still saves the money. */}
            <Button size="sm" disabled={busy} onClick={() => onPaid(alarm.bill.id)}>
              Mark paid
            </Button>
            {!alarm.bill.hasWrittenAgreement ? (
              <Unavailable label="Attach agreement" reason={NEEDS_UPLOAD} />
            ) : null}
          </>
        ) : (
          // Nothing here saves the deduction; paying is still owed.
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onPaid(alarm.bill.id)}>
            Mark paid
          </Button>
        )}
      </div>
    </div>
  );
}

function AlarmBand({
  data,
  onPaid,
  busy,
}: {
  data: MoneyData;
  onPaid: (billId: string) => void;
  busy: boolean;
}) {
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
          <AlarmRow key={alarm.bill.id} alarm={alarm} onPaid={onPaid} busy={busy} />
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

/* ----------------------------------------------------------- billing due */

/*
 * `BillingDue` lived here: a worklist of contract instalments whose *date* had
 * passed, offered for billing whether or not anybody had been to the site.
 *
 * It is replaced by `ReadyToBill`, which asks the register what the work has
 * earned — a visit booked, dated, assigned and completed releases its billing
 * period, and nothing else does. Keeping both would have put two answers to
 * "what should I bill?" on one screen, and the calendar's answer is the one
 * that bills for work that has not happened.
 */

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
  const call = telHref(row.phone);
  /*
    The message is a draft, never a send. wa.me opens WhatsApp with the text
    ready and the person presses send — chasing ₹86,400 is not something
    software should do on someone's behalf without them seeing it.
  */
  const remind = whatsappHref(
    row.phone,
    `Hello ${row.customer}, this is a reminder about invoice ${row.invoiceNumber} dated ${row.invoiceDate}, which is now ${row.daysOverdue} days overdue. Kindly let us know when we can expect payment. Thank you.`,
  );

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

      {/*
        The balance, and what it is a balance *of*.

        The outstanding figure alone reads identically whether the customer has
        paid most of the bill or none of it, and those are opposite calls to
        make. Shown only when something has actually come in — on a wholly
        unpaid invoice the second line would just repeat the first.
      */}
      <span className="w-32 shrink-0 text-right">
        <MoneyText amount={asPaise(row.amountPaise)} className="font-medium" />
        {isPartPaid(row) ? (
          <span className="block text-xs text-success tabular-nums">
            <MoneyText amount={asPaise(row.paidPaise)} /> paid of{" "}
            <MoneyText amount={asPaise(row.billedPaise)} />
          </span>
        ) : null}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {row.promise !== null && !row.promise.broken ? (
          // FR-904: no reminder button at all. The restraint has to be visible,
          // otherwise it reads as a missing feature.
          <Badge variant="outline" className="text-xs">
            Promised {row.promise.dateWord}
          </Badge>
        ) : (
          remind ? (
            <Button
              variant={primary ? "default" : "outline"}
              size="sm"
              aria-label={`Send WhatsApp reminder to ${row.customer}`}
              render={<a href={remind} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              <MessageCircle className="size-3.5" />
              Remind
            </Button>
          ) : (
            <Unavailable
              label="Remind"
              icon={MessageCircle}
              reason={`No phone number on record for ${row.customer}`}
            />
          )
        )}
        {call ? (
          <Button
            variant="outline"
            size="sm"
            render={<a href={call} />}
            nativeButton={false}
          >
            <Phone className="size-3.5" />
            Call
          </Button>
        ) : (
          <Unavailable
            label="Call"
            icon={Phone}
            reason={`No phone number on record for ${row.customer}`}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Work that has been delivered and not yet billed.
 *
 * **Why this sits above "They owe us".** A receivable is money the customer
 * knows about; this is money the customer does *not* know about, because
 * nobody has asked for it. An AMC visit completed in August and never invoiced
 * is revenue that quietly ages out of the year — and it is invisible on a
 * screen that only lists documents already raised.
 *
 * **Why a prompt and not a write.** FR-805 makes an invoice immutable once
 * issued. A rule that raised one automatically would turn a mis-tapped
 * "Done" at the wrong address into a statutory document that can only be
 * cancelled, leaving a numbered hole somebody has to account for. The rule
 * decides what is *earned*; a person decides what is *billed*.
 */
function ReadyToBill({
  rows,
  totalPaise,
  onRaise,
  busy,
}: {
  rows: BillablePeriod[];
  totalPaise: number;
  onRaise: (row: BillablePeriod) => void;
  busy: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <ReceiptIndianRupee className="size-4 text-success" />
          Ready to bill
        </h2>
        <MoneyText
          amount={asPaise(totalPaise)}
          className="text-lg font-semibold tracking-tight"
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          {rows.length} contract {rows.length === 1 ? "period" : "periods"} earned and
          not yet invoiced
        </p>
      </div>

      <Panel
        title="Ready to bill"
        icon={ReceiptIndianRupee}
        count={rows.length}
        caption="Oldest first — the money owed longest is the money to raise first"
        flush
      >
        {rows.map((row) => (
          <div
            key={`${row.contractId}-${row.periodStart}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm odd:bg-white/[0.018]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.customer}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.reference} · {row.periodStart} to {row.periodEnd}
              </p>
            </div>

            {/*
              The two reasons read very differently to whoever is about to
              send this, so they are named rather than collapsed into a count.
            */}
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium",
                row.reason === "visits_complete"
                  ? "bg-success/12 text-success"
                  : "bg-warning/12 text-warning",
              )}
            >
              {row.reason === "visits_complete"
                ? `${row.visitsDone} of ${row.visits} visits done`
                : `Period closed · ${row.visitsDone} of ${row.visits} done`}
            </span>

            <MoneyText
              amount={asPaise(row.valuePaise)}
              className="w-28 shrink-0 text-right font-medium tabular-nums"
            />

            <Button size="sm" variant="outline" disabled={busy} onClick={() => onRaise(row)}>
              Raise invoice
            </Button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Receivables({ data }: { data: MoneyData }) {
  const [filter, setFilter] = useState<AgeingBucket | null>(null);
  /*
    Part-paid is a separate axis from age, not another bucket.

    An invoice can be 40 days late *and* half collected, and those are two
    different things to say on the call — "you owe us" versus "thank you for the
    four thousand, when does the rest come". Making it a bucket would force a
    choice between them.
  */
  const [partPaidOnly, setPartPaidOnly] = useState(false);
  const partPaid = data.receivables.filter(isPartPaid);
  const visible = data.receivables
    .filter((r) => (filter ? bucketFor(r.daysOverdue) === filter : true))
    .filter((r) => (partPaidOnly ? isPartPaid(r) : true));
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

      {/*
        Offered only when there is something to see.

        A permanently-visible filter that always yields nothing teaches the
        reader to ignore the row it sits in — and this one carries the number
        the firm is losing money on.
      */}
      {partPaid.length > 0 ? (
        <button
          type="button"
          aria-pressed={partPaidOnly}
          onClick={() => setPartPaidOnly((on) => !on)}
          className={cn(
            "flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
            partPaidOnly
              ? "bg-primary font-medium text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <IndianRupee className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {partPaid.length} part paid
            {partPaidOnly ? " — showing only these" : ""}
          </span>
          <MoneyText
            amount={asPaise(partPaid.reduce((sum, r) => sum + r.amountPaise, 0))}
            className="tabular-nums"
          />
        </button>
      ) : null}

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

function PayableRow({
  bill,
  onPaid,
  busy,
}: {
  bill: Payable;
  onPaid: (billId: string) => void;
  busy: boolean;
}) {
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
            <Unavailable label="Verify Udyam status" reason={NEEDS_BACKEND} />
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onPaid(bill.id)}>
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

function Payables({
  data,
  onPaid,
  busy,
}: {
  data: MoneyData;
  onPaid: (billId: string) => void;
  busy: boolean;
}) {
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
          <PayableRow key={bill.id} bill={bill} onPaid={onPaid} busy={busy} />
        ))}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ screen */

export default function MoneyPage() {
  const [query, setQuery] = useState<Query<MoneyData>>(loading());
  /*
    What the work has earned, from the register.

    Kept beside the money query rather than inside it: this is the only figure
    on the screen that is not yet a document, and folding it into the overview
    would make a "receivable" out of something nobody has been billed for.
  */
  const [due, setDue] = useState<{ due: BillablePeriod[]; totalPaise: number }>({
    due: [],
    totalPaise: 0,
  });
  // Two writes on this screen, each with its own in-flight state: settling a
  // bill must not disable the button that raises an invoice.
  const pay = useMutation(payPurchaseBill);
  const raiseInvoice = useMutation(createInvoice);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getMoney().then((result) => {
      if (!cancelled) setQuery(result);
    });
    void getDueInvoices().then((result) => {
      if (!cancelled && result.status === "ready") setDue(result.data);
    });
    return () => {
      cancelled = true;
    };
    // Re-reads after a bill is paid, so the alarm band and both totals
    // recompute from the same facts rather than drifting from the list.
      // Nothing writes to the store, so nothing here changes because of it.
  }, []);

  /*
    TODO(FR-905): the screen should ask *when* it was paid rather than assume
    today. A bill settled on Friday and recorded on Monday is three days of a
    fifteen-day clock, and the API already takes the real date — this is the
    only place still supplying a default.
  */
  async function markPaid(billId: string) {
    await pay.run(billId, { paidOn: new Date().toISOString().slice(0, 10) });
  }

  /**
   * Raises the draft and opens it — never files anything unseen.
   *
   * A DRAFT, deliberately. FR-805 makes an invoice immutable from the moment it
   * is issued, so the button that *earns* an invoice and the button that
   * *issues* one are two different presses with a document in between.
   *
   * The line describes the period in dates rather than as "instalment 5",
   * because the customer can check one of those against their own records.
   */
  async function raise(row: BillablePeriod) {
    const result = await raiseInvoice.run({
      contractId: row.contractId,
      contractPoint: row.instalment,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      lines: [
        {
          description: `${row.reference} — ${row.periodStart} to ${row.periodEnd}`,
          code: "9987",
          kind: "service",
          qty: 1,
          ratePaise: row.valuePaise,
          ratePercent: 18,
        },
      ],
    });
    // The review screen is told which document to show, not left to guess.
    if (result?.ok) router.push(`/money/invoice?id=${result.data.id}`);
  }

  const today = new Date();

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-3 lg:p-4">
        {/*
          A refused write has to land where the eye already is. Settling a bill
          and raising an invoice fail for different reasons — a 409 on an
          already-paid bill is not the same conversation as a 403 on billing —
          so each keeps its own message rather than sharing one slot.
        */}
        {pay.error ? (
          <div className="mb-4">
            <ErrorState error={pay.error} onRetry={pay.reset} />
          </div>
        ) : null}
        {raiseInvoice.error ? (
          <div className="mb-4">
            <ErrorState error={raiseInvoice.error} onRetry={raiseInvoice.reset} />
          </div>
        ) : null}
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
              <AlarmBand data={data} onPaid={markPaid} busy={pay.pending} />
              {/*
                **What the work earned, in place of what the calendar said.**

                This was `<BillingDue>`, which offered an invoice as soon as an
                instalment date passed — whether or not anybody had been to the
                site. Raunak's rule is the other way round: the visit is booked,
                dated, assigned and completed, and *then* the period can be
                billed. Both lists on one screen would be two answers to one
                question, so this replaces it rather than joining it.
              */}
              <ReadyToBill
                rows={due.due}
                totalPaise={due.totalPaise}
                onRaise={raise}
                busy={raiseInvoice.pending}
              />
              {/*
                FR-810 sits between the billing worklist and the two ledgers:
                it is neither owed to us nor owed by us, it is money we hold
                against work still to do - and it changes how both totals
                should be read.
              */}
              <AdvancesPanel />
              <RecordedBills />
              <div className="grid gap-5 xl:grid-cols-2">
                <Receivables data={data} />
                <Payables data={data} onPaid={markPaid} busy={pay.pending} />
              </div>
            </div>
          )}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
