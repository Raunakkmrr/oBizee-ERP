"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyText } from "@/components/shared/money-text";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { loading, type Query } from "@/lib/data/result";
import {
  BILLING_LABEL,
  COVERAGE_LABEL,
  RECURRENCE_LABEL,
  getContracts,
  scheduleProgress,
  type Contract,
} from "@/lib/data/contracts";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
import { useStoreState } from "@/lib/data/use-store";

/**
 * Contracts — PRD §6.14's contract detail, rendered as a list of cards.
 *
 * **The one decision:** *is this contract being delivered, and is it billed?*
 *
 * §6.14 calls the segmented visit bar "the highest-value element" — it "answers
 * 'are we delivering what we sold' in one glance, and a contract
 * under-delivering visits is a renewal that will be lost". So each schedule
 * carries its own `n of m` bar, which is also how FR-1406's multi-schedule
 * contracts stay legible: one contract, several cadences, each measurable.
 */
function ContractCard({ contract }: { contract: Contract }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{contract.customer}</p>
            <p className="text-sm text-muted-foreground">{contract.site}</p>
            <p className="text-xs text-muted-foreground tnum-id">
              {contract.reference}
            </p>
          </div>
          <div className="text-right">
            <MoneyText
              amount={asPaise(contract.annualValuePaise)}
              className="text-lg font-semibold"
            />
            {/* Billing frequency stated beside the value, because the value
                alone does not say when the money arrives (FR-505). */}
            <p className="text-xs text-muted-foreground">
              {BILLING_LABEL[contract.billing]}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {COVERAGE_LABEL[contract.coverage]} ·{" "}
          {/* Days remaining as a word — §6.14 wants the period legible, not
              computed by the reader. */}
          <span className="tabular-nums">
            {contract.daysRemaining} days remaining
          </span>
        </p>

        {/*
          One bar per schedule. FR-1406: a contract carries many schedules, each
          with its own scope and cadence — a single aggregate bar would hide a
          chiller line that has been missed while the AC line runs on time.
        */}
        <div className="space-y-2">
          {contract.schedules.map((schedule) => {
            const progress = scheduleProgress(
              schedule,
              contract.termDays,
              contract.daysRemaining,
            );
            return (
              <div key={schedule.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    {schedule.scope}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {RECURRENCE_LABEL[schedule.recurrence]}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {schedule.visitsDone} of {schedule.visitsCommitted} visits
                  </span>
                </div>
                {/*
                  §6.14 asks for a **segmented** bar and calls it "the
                  highest-value element" on the screen. A 4px continuous track
                  was neither: at full resolution it read as an underline on the
                  label above it, and it could only encode one number.

                  One cell per committed visit gives three distinguishable
                  states in one row — delivered, due-and-missed, still to come —
                  so the shortfall is *countable* rather than inferred from the
                  length of a bar.
                */}
                <div
                  className="flex gap-px"
                  role="img"
                  aria-label={`${schedule.scope}: ${schedule.visitsDone} of ${schedule.visitsCommitted} visits delivered, ${progress.expectedByNow} due by now`}
                >
                  {Array.from(
                    { length: schedule.visitsCommitted },
                    (_, index) => {
                      const delivered = index < schedule.visitsDone;
                      const missed =
                        !delivered && index < progress.expectedByNow;
                      return (
                        <span
                          key={index}
                          className={cn(
                            "h-2 flex-1 rounded-[1px]",
                            delivered
                              ? "bg-primary"
                              : missed
                                ? "bg-destructive/70"
                                : "bg-muted",
                          )}
                        />
                      );
                    },
                  )}
                </div>
                {progress.isBehind ? (
                  // The number, not just the adjective — "behind schedule" is a
                  // mood; "6 visits behind" is something you can staff for. A
                  // word as well as the bar, because colour and length alone
                  // are not a channel (§6.13.4).
                  <p className="text-xs text-brand-brown tabular-nums">
                    {progress.behindBy} visit
                    {progress.behindBy === 1 ? "" : "s"} behind —{" "}
                    {progress.expectedByNow} were due by now. A contract
                    under-delivering visits is a renewal that will be lost.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContractsPage() {
  const [query, setQuery] = useState<Query<{ contracts: Contract[] }>>(
    loading(),
  );

  // Re-reads whenever any surface writes to the store.
  const storeState = useStoreState();

  useEffect(() => {
    let cancelled = false;
    getContracts().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, [storeState]);

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
          className="mb-4"
          title="Contracts"
          description="Recurring revenue, and the engine that generates future jobs."
          actions={
            <Button render={<Link href="/contracts/new" />} nativeButton={false}>
              <Plus className="size-4" />
              New contract
            </Button>
          }
        />

        <QueryBoundary query={query} label="contracts" loadingRows={3}>
          {(data) => (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.contracts.map((contract) => (
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </div>
          )}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
