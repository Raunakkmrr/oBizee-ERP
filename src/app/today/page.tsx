"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { StateStrip } from "@/components/board/state-strip";
import { JobRow } from "@/components/board/job-row";
import { TechnicianPanel } from "@/components/board/technician-panel";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { loading, type Query } from "@/lib/data/result";
import {
  FILTER_LABEL,
  getBoard,
  matchesFilter,
  type Board,
  type BoardFilter,
  type JobRow as JobRowData,
  type Technician,
} from "@/lib/data/board";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
import { useDispatch, useStoreState } from "@/lib/data/use-store";
import { can } from "@/lib/roles";

/**
 * Today — the dispatch board. PRD §6.4.
 *
 * **The one decision:** *which unassigned or stuck job do I act on in the next
 * two minutes, and who do I give it to?* Not a dashboard — a work queue with the
 * supply side beside the demand side.
 *
 * Layout follows §6.4.1 exactly, and the heights are load-bearing rather than
 * stylistic: date bar 48px + state strip ~64px sit above a 60/40 split of job
 * rows and the technician panel. §6.4.4 budgets 440px of remaining height at
 * 1366×768, which 44px rows turn into ten jobs above the fold.
 *
 * **Primary action is `[Assign]`** on the rows (§6.4.6). `[+ Create job]` is
 * secondary and lives in the date bar — "never in a floating button and never in
 * a menu". Defect **D7** resolved this: §6.4.1 and §6.4.6 disagreed about which
 * was primary, and §6.13.2 makes a second primary-styled button a defect.
 */
const VIEWS = ["Today", "Tomorrow", "This week"] as const;

export default function TodayBoardPage() {
  const [query, setQuery] = useState<Query<Board>>(loading());
  const dispatch = useDispatch();
  // Subscribing keeps this screen live when another surface writes.
  const storeState = useStoreState();
  const [filter, setFilter] = useState<BoardFilter | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRowData | null>(null);
  const [view, setView] = useState<(typeof VIEWS)[number]>("Today");
  const [hideAmounts, setHideAmounts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBoard().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, [storeState]);

  const today = new Date();
  const canAssign = can(CURRENT_USER.role, "job:dispatch");

  const board = query.status === "ready" ? query.data : null;

  const rows = useMemo(() => {
    if (!board) return [];
    // No local assignment overlay any more — the store is the single source, so
    // an assignment made here is the same fact the Jobs list and job detail see.
    return filter
      ? board.jobs.filter((job) => matchesFilter(job, filter))
      : board.jobs;
  }, [board, filter]);

  function handleAssign(technician: Technician) {
    if (!selectedJob) return;
    dispatch({
      type: "ASSIGN_JOB",
      jobId: selectedJob.id,
      technicianId: technician.id,
      technicianName: technician.name,
    });
    setSelectedJob(null);
    void getBoard().then(setQuery);
  }

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
      badges={{ unassigned_today: board?.counters.unassigned, leads_overdue: 7 }}
      hideAmounts={hideAmounts}
      onToggleAmounts={() => setHideAmounts((v) => !v)}
    >
      {/* Date + view bar, 48px (§6.4.1). */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3 lg:px-4">
        <Button variant="ghost" size="icon-sm" aria-label="Previous day">
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next day">
          <ChevronRight className="size-4" />
        </Button>

        {/* Visible segments, never a dropdown of views (§6.2). */}
        <div className="flex items-center gap-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                view === v
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {/*
          Secondary, and always in the bar — §6.4.1: "never in a floating button
          and never in a menu". `[Assign]` is this screen's only primary.
        */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden sm:inline-flex"
          render={<Link href="/jobs/new" />}
          nativeButton={false}
        >
          <Plus className="size-4" />
          Create job
        </Button>
      </div>

      {/*
        At 390px the bar has no room for it beside the day controls and the view
        segments, so §6.4.7 moves it to a **pinned bottom-right pill** — and is
        explicit that it stays a *labelled* pill, never a bare `+` icon (P2): an
        unlabelled FAB is a guess, and this is the action that creates revenue.
      */}
      <Button
        size="sm"
        variant="outline"
        className="fixed right-4 bottom-4 z-[var(--z-sticky)] rounded-full shadow-md sm:hidden"
        render={<Link href="/jobs/new" />}
        nativeButton={false}
      >
        <Plus className="size-4" />
        Create job
      </Button>

      <QueryBoundary query={query} label="today's jobs" loadingRows={10}>
        {(data) => (
          <>
            <StateStrip
              counters={data.counters}
              active={filter}
              onToggle={(next) => {
                setFilter(next);
                setSelectedJob(null);
              }}
            />

            {/* `pb-20` only where the pinned pill exists, so the last card is
                never permanently sitting underneath it. */}
            <div className="grid gap-4 p-3 pb-20 sm:pb-3 lg:p-4 xl:grid-cols-5">
              {/* Job rows — 60% (§6.4.1). */}
              <Card className="gap-0 overflow-hidden py-0 xl:col-span-3">
                {/* Column headers belong to the row layout; below `sm` the
                    rows are cards (§6.4.7) and there are no columns to head. */}
                <div className="hidden h-10 items-center gap-3 border-b bg-muted/50 px-3 text-xs font-medium text-muted-foreground sm:flex">
                  <span className="w-12 shrink-0">Slot</span>
                  <span className="flex-1">Job</span>
                  <span className="w-36 shrink-0 text-right">Technician</span>
                </div>

                {rows.length === 0 ? (
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>
                        {filter
                          ? `No jobs with status “${FILTER_LABEL[filter]}” today.`
                          : "No jobs scheduled for today."}
                      </EmptyTitle>
                      <EmptyDescription>
                        {filter
                          ? "The filter is still on — clear it to see the rest of the day."
                          : `${data.leadsDueToday} leads are due for follow-up today.`}
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      {/*
                        §6.4.5 keeps these two empties distinct on purpose: the
                        user's mistake is different, so the way out must be too.
                      */}
                      {filter ? (
                        <Button onClick={() => setFilter(null)}>
                          Clear filter
                        </Button>
                      ) : (
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button
                            render={<Link href="/jobs" />}
                            nativeButton={false}
                          >
                            Create a job
                          </Button>
                          <Button
                            variant="outline"
                            render={<Link href="/today" />}
                            nativeButton={false}
                          >
                            See tomorrow ({data.tomorrowJobs})
                          </Button>
                        </div>
                      )}
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div>
                    {(() => {
                      /*
                        §6.4.6: the screen's single primary is [Assign] on the
                        **highest-priority unassigned row**. Priority order is
                        breakdown > urgent > normal, then position — which is
                        the order the coordinator would pick anyway.
                      */
                      const rank = { breakdown: 0, urgent: 1, normal: 2 };
                      const primaryId = [...rows]
                        .filter((j) => j.technician === null)
                        .sort((a, b) => rank[a.priority] - rank[b.priority])[0]?.id;
                      return rows.map((job) => (
                        <JobRow
                          key={job.id}
                          job={job}
                          canAssign={canAssign}
                          onAssign={setSelectedJob}
                          /*
                            Only while nothing is being assigned. Once a job is
                            selected, the live decision is "which technician",
                            and that primary lives in the panel — leaving this
                            one filled would put two primaries on screen and
                            reintroduce exactly the ambiguity §6.13.2 forbids.
                          */
                          isPrimaryAssign={
                            selectedJob === null && job.id === primaryId
                          }
                        />
                      ));
                    })()}
                  </div>
                )}
              </Card>

              {/* Technician panel — 40%, scrolls independently (§6.4.1). */}
              <div className="xl:col-span-2">
                <TechnicianPanel
                  technicians={data.technicians}
                  selectedJob={selectedJob}
                  onAssign={handleAssign}
                />
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </AppShell>
  );
}
