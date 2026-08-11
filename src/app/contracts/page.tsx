"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/panel";
import { CalendarPlus, FileClock } from "lucide-react";
import { MoneyText } from "@/components/shared/money-text";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { loading, type Query } from "@/lib/data/result";
import { BILLING_LABEL, COVERAGE_LABEL, RECURRENCE_LABEL, getContracts, scheduleProgress, visitSchedule, type Contract } from "@/lib/data/contracts";
import { generateVisits } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { getBoard } from "@/lib/data/board";
import { RenewalsBand } from "@/components/contracts/renewals-band";

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
function ContractCard({
  contract,
  visitKeys,
  onGenerated,
}: {
  contract: Contract;
  /*
    The visit keys already on the board, from the register.

    FR-502's idempotency key is what makes "generate visits" safe to run
    twice, and it only works if the keys being compared are the ones the
    register holds. Reading a local board meant a second machine's visits were
    invisible and the button offered to create them again.
  */
  visitKeys: ReadonlySet<string>;
  onGenerated: () => void;
}) {
  const generate = useMutation(
    async (contractId: string) => {
      const result = await generateVisits(contractId);
      if (result.ok) onGenerated();
      return result;
    },
  );

  /*
    FR-502. What this contract owes in the next 90 days, and how much of that
    is already on the board. Stating both is what makes the control honest:
    "3 visits scheduled" is a fact the reader can check against Today, and a
    button that would create nothing says so instead of pretending to work.
  */
  /*
    The contract's own answer, not the board's.

    This read `getBoard()`, which returns only jobs scheduled for *today* —
    and visits are generated ninety days ahead. So the set was empty for every
    contract whose visits were not today, which is all of them: the banner said
    "none on the board yet" no matter how many times somebody had generated
    them, and offered to do it again for ever.
  */
  const existingKeys = new Set(contract.visitsOnBoard ?? []);
  const planned = visitSchedule(contract, new Date());
  const pending = planned.filter((visit) => !existingKeys.has(visit.key));

  return (
    <Panel
      title={contract.customer}
      icon={FileClock}
      caption={contract.site}
      actions={
        <div className="text-right">
          <MoneyText
            amount={asPaise(contract.annualValuePaise)}
            className="block text-lg leading-tight font-semibold"
          />
          {/* Billing frequency stated beside the value, because the value
              alone does not say when the money arrives (FR-505). */}
          <p className="text-xs text-muted-foreground">
            {BILLING_LABEL[contract.billing]}
          </p>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted-bg p-2.5">
          <p className="min-w-0 text-xs text-muted-foreground">
            {planned.length === 0
              ? "No visits fall in the next 90 days"
              : pending.length === 0
                ? `All ${planned.length} visit${planned.length === 1 ? "" : "s"} due in the next 90 days are on the board`
                : pending.length === planned.length
                  ? `${planned.length} visit${planned.length === 1 ? "" : "s"} due in the next 90 days, none on the board yet`
                  : `${pending.length} of ${planned.length} visits due in the next 90 days are not on the board yet`}
          </p>
          {pending.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={generate.pending}
              onClick={() => void generate.run(contract.id)}
            >
              <CalendarPlus className="size-3.5" />
              Put {pending.length} on the board
            </Button>
          ) : null}
        </div>

        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="tnum-id">{contract.reference}</span>
          <span aria-hidden="true">·</span>
          {COVERAGE_LABEL[contract.coverage]}
          <span aria-hidden="true">·</span>
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
      </div>
    </Panel>
  );
}

export default function ContractsPage() {
  const [query, setQuery] = useState<Query<{ contracts: Contract[] }>>(
    loading(),
  );

  const [visitKeys, setVisitKeys] = useState<ReadonlySet<string>>(new Set());

  const reload = useCallback(() => {
    void getContracts().then(setQuery);
    // The board carries the visit keys FR-502 dedupes on.
    void getBoard().then((result) => {
      if (result.status !== "ready") return;
      setVisitKeys(
        new Set(
          result.data.jobs
            .map((job) => job.visitKey)
            .filter((key): key is string => key !== null),
        ),
      );
    });
  }, []);
  useEffect(reload, [reload]);

  const today = new Date();

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-4"
          breadcrumb={[{ label: "Work" }]}
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
            <>
              <RenewalsBand contracts={data.contracts} />
              <div className="grid gap-4 lg:grid-cols-2">
                {data.contracts.map((contract) => (
                  <ContractCard
                    key={contract.id}
                    contract={contract}
                    visitKeys={visitKeys}
                    onGenerated={reload}
                  />
                ))}
              </div>
            </>
          )}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
