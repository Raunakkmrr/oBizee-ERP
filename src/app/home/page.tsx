"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Phone, RotateCw } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MoneyText } from "@/components/shared/money-text";
import { ROW } from "@/components/shared/controls";
import { toneClasses } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import { loading, type Query } from "@/lib/data/result";
import {
  getOwnerHome,
  toComputedMoney,
  type CallRow,
  type OwnerHome,
} from "@/lib/data/owner-home";
import { SEED_TENANT, SEED_USERS } from "@/lib/data/fixtures/tenant";

/**
 * Owner Home — PRD §6.10. Mobile-first at 390px.
 *
 * **The one decision:** *is anything on fire, and if so what do I pick up?* The
 * owner is "an exception handler, not a report reader", so this is "a **triage
 * list with two numbers on top**, not a dashboard".
 *
 * Above the fold, in exactly §6.10.1's order: money pair → three counters →
 * today's completion bar → Needs your call.
 *
 * **Deliberately not here** (§6.10.1): revenue charts, technician leaderboards,
 * month-to-date totals, pipeline value, AMC renewal counts. All real, all one
 * tap down under Review, "because they inform weekly decisions" — and "a chart
 * cannot be acted on from a car".
 *
 * **No create action** (§6.10.3): the owner does not do data entry.
 */

/**
 * The money pair. §6.10.2 draws the distinction this component exists to keep:
 *
 * - a **genuinely quiet day** renders **₹0.00** — a true zero, and correct;
 * - a **failed aggregate** renders **—** with its own retry.
 *
 * "A false zero on the owner's money tile is the most damaging bug in this
 * product", so the two are never allowed to look alike. `Computed<Paise>` makes
 * that structural: the failure branch carries no number to render.
 */
function MoneyTile({
  label,
  amount,
  subLine,
  hidden,
}: {
  label: string;
  amount: OwnerHome["collectedToday"];
  subLine: string;
  hidden: boolean;
}) {
  const failed = !amount.ok;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      {/* 28px, tabular, never abbreviated to "₹3.1L" (§6.10.1, P5). */}
      <p className="mt-0.5 text-[28px] leading-9 font-semibold">
        <MoneyText amount={toComputedMoney(amount)} hidden={hidden} />
      </p>
      {failed ? (
        <div className="mt-0.5 space-y-1">
          {/* Wrapped rather than squeezed beside the button: at 390px the two
              money tiles share the row, and forcing the reason and the retry
              onto one line pushed the message to four lines. */}
          <p className="text-sm leading-tight text-brand-brown">{amount.reason}</p>
          <Button variant="outline" size="xs" aria-label={`Retry ${label}`}>
            <RotateCw className="size-3" />
            Retry
          </Button>
        </div>
      ) : (
        // A count turns a number into a next action (§6.10.1).
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {subLine}
        </p>
      )}
    </div>
  );
}

function CallRowItem({ row, primary }: { row: CallRow; primary: boolean }) {
  return (
    <li className={cn("flex items-start gap-3 px-2 py-3", ROW)}>
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
          toneClasses[row.badge.startsWith("★") ? "danger" : "warning"],
        )}
      >
        {row.badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.who}</span>
        {/* Wraps to two lines: "Waiting on a 4..." loses the whole point. §9.6
            lets a name ellipsise; the reason for the call may not. */}
        <span className="line-clamp-2 block text-sm text-muted-foreground">
          {row.what}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.meta}
        </span>
      </span>
      <span className="flex shrink-0 gap-1.5">
        {/*
          §6.10.3: the primary action is [Call] on the FIRST row. Only that one
          is filled — a second primary would destroy the cue telling a hurried
          owner where to start (§6.13.2).
        */}
        <Button
          size="sm"
          variant={primary ? "default" : "outline"}
          render={<a href={`tel:${row.phone.replace(/\s/g, "")}`} />}
          nativeButton={false}
          aria-label={`Call ${row.who}`}
        >
          <Phone className="size-3.5" />
          Call
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<Link href={row.href} />}
          nativeButton={false}
        >
          Open
        </Button>
      </span>
    </li>
  );
}

export default function OwnerHomePage() {
  const [query, setQuery] = useState<Query<OwnerHome>>(loading());
  const [hideAmounts, setHideAmounts] = useState(false);
  const owner = SEED_USERS[0];

  useEffect(() => {
    let cancelled = false;
    getOwnerHome().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();

  return (
    <AppShell
      role="owner"
      userName={owner.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
      hideAmounts={hideAmounts}
      onToggleAmounts={() => setHideAmounts((v) => !v)}
    >
      {/*
        §6.10.4: on web this is a single 720px column. The owner's web landing is
        Today, not this — Owner Home exists on web "only so a link from a
        WhatsApp digest resolves to something on a laptop".
      */}
      <div className="mx-auto w-full max-w-[720px] p-4">
        <QueryBoundary query={query} label="your day" loadingRows={3}>
          {(data) => {
            /*
              §6.10.2: a brand-new tenant gets **a different state entirely** —
              a three-step setup list, because "an owner on day one must not see
              a screen of zeros". Zeros are meaningful only once there is a
              business behind them.
            */
            if (data.isNewTenant) {
              const done = data.setupSteps.filter((s) => s.done).length;
              return (
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div>
                      <h1 className="text-lg font-semibold">
                        Let&apos;s get {SEED_TENANT.businessName} set up
                      </h1>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {done} of {data.setupSteps.length} done
                      </p>
                    </div>
                    <Progress
                      value={(done / data.setupSteps.length) * 100}
                      aria-label="Setup progress"
                    />
                    <ol className="space-y-2">
                      {data.setupSteps.map((step, index) => (
                        <li
                          key={step.label}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">
                            {index + 1}
                          </span>
                          <span className="flex-1 text-sm">{step.label}</span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              );
            }

            const hasCalls = data.needsYourCall.length > 0;

            return (
              <div className="space-y-4">
                <h1 className="text-lg font-semibold">
                  {SEED_TENANT.businessName}
                </h1>

                {/* --- Money pair --- */}
                <Card>
                  <CardContent className="flex gap-4 p-4">
                    <MoneyTile
                      label="Collected today"
                      amount={data.collectedToday}
                      subLine={`${data.collectedCount} payments`}
                      hidden={hideAmounts}
                    />
                    <MoneyTile
                      label="Overdue"
                      amount={data.overdue}
                      subLine={`${data.overdueCount} invoices`}
                      hidden={hideAmounts}
                    />
                  </CardContent>
                </Card>

                {/* --- Three counters, each a link (§6.10.1) --- */}
                <div className="grid grid-cols-3 gap-2">
                  {data.counters.map((counter) => (
                    <Link
                      key={counter.label}
                      href={counter.href}
                      className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {/* 34px numerals, 14px labels (§6.10.1). */}
                      <span className="block text-[34px] leading-10 font-bold tabular-nums">
                        {counter.count}
                      </span>
                      <span className="block text-sm leading-tight text-muted-foreground">
                        {counter.label}
                      </span>
                    </Link>
                  ))}
                </div>

                {/* --- Today's completion bar: one line, one glance --- */}
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">Today</span>
                      <span className="tabular-nums text-muted-foreground">
                        {data.jobsDone} of {data.jobsTotal} done
                      </span>
                    </div>
                    <Progress
                      value={(data.jobsDone / data.jobsTotal) * 100}
                      aria-label={`${data.jobsDone} of ${data.jobsTotal} jobs done today`}
                    />
                  </CardContent>
                </Card>

                {/* --- Needs your call — three rows maximum --- */}
                <Card>
                  <CardContent className="p-4">
                    <p className="mb-1 text-sm font-medium">
                      Needs your call
                      <span className="ml-1.5 text-muted-foreground tabular-nums">
                        {data.needsYourCall.length}
                      </span>
                    </p>
                    {hasCalls ? (
                      <ul>
                        {data.needsYourCall.map((row, index) => (
                          <CallRowItem
                            key={row.id}
                            row={row}
                            primary={index === 0}
                          />
                        ))}
                      </ul>
                    ) : (
                      <div className="space-y-3 py-2">
                        {/* Never a trophy graphic (§6.10.2). */}
                        <p className="text-sm">
                          Nothing needs your attention right now.
                        </p>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {data.jobsDone} of {data.jobsTotal} jobs done today.
                        </p>
                        {/* §6.10.3: with no calls, the primary becomes this. */}
                        <Button render={<Link href="/today" />} nativeButton={false}>
                          Open today&apos;s board
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
