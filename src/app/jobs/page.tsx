"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { ColumnHeader, Panel } from "@/components/shared/panel";
import { cn } from "@/lib/utils";
import { EM_DASH, loading, renderComputed, type Query } from "@/lib/data/result";
import { formatMoney } from "@/lib/money";
import { BOARD_FILTERS, FILTER_LABEL, getBoard, jobValue, matchesFilter, type Board, type BoardFilter } from "@/lib/data/board";
import { useStoreState } from "@/lib/data/use-store";

/**
 * Jobs — the searchable record of every work order, as distinct from `/today`.
 *
 * **The one decision:** *where has this job got to?* Today's board answers "who
 * goes where now"; this answers "what happened to J-2608-0431" — a different
 * question with a different shape, which is why it is a table rather than a
 * dispatch board and why it carries the job number as the leading column.
 *
 * Every row navigates to the job detail. The filters are the board's own, so a
 * coordinator moving between the two screens does not relearn the vocabulary.
 */
export default function JobsPage() {
  const [query, setQuery] = useState<Query<Board>>(loading());
  /**
   * `null` is "everything". It is deliberately *not* a sixth member of
   * `BoardFilter`: §6.4.1's union has no total because the board must never
   * offer one. A record list may show everything — but it borrows the union
   * rather than widening it, so the board's rule stays enforced at the type.
   */
  const [filter, setFilter] = useState<BoardFilter | null>(null);

  // Re-reads whenever any surface writes to the store.
  const storeState = useStoreState();

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

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-4"
          breadcrumb={[{ label: "Work" }]}
          title="Jobs"
          description="Every work order, and where it has got to."
          actions={
            <Button render={<Link href="/jobs/new" />} nativeButton={false}>
              <Plus className="size-4" />
              New work order
            </Button>
          }
        />

        <div className="mb-3 flex flex-wrap gap-1.5">
          {[null, ...BOARD_FILTERS].map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "min-h-9 rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
                "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                filter === value
                  ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-card)]"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {value === null ? "All" : FILTER_LABEL[value]}
            </button>
          ))}
        </div>

        <QueryBoundary query={query} label="jobs" loadingRows={8}>
          {(data) => {
            const rows =
              filter === null
                ? data.jobs
                : data.jobs.filter((job) => matchesFilter(job, filter));
            return (
              <Panel
                title={filter === null ? "All work orders" : FILTER_LABEL[filter]}
                icon={Wrench}
                count={rows.length}
                caption="Newest first — the record, not the dispatch board"
                flush
              >
                <ColumnHeader>
                  <span className="w-32 shrink-0">Number</span>
                  <span className="min-w-0 flex-1">Customer</span>
                  <span className="w-[104px] shrink-0">Status</span>
                  <span className="hidden w-32 shrink-0 sm:block">Technician</span>
                  <span className="w-28 shrink-0 text-right">Billed</span>
                </ColumnHeader>
                {rows.map((job) => {
                  const value = jobValue(job);
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.jobNumber}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors odd:bg-white/[0.018] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="w-32 shrink-0 text-xs text-muted-foreground tnum-id">
                        {job.jobNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{job.customer}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {job.locality} · {job.serviceType}
                        </p>
                      </div>
                      <span className="w-[104px] shrink-0">
                        <StatusBadge status={job.status} kind="job" className="text-[11px]" />
                      </span>
                      <span className="hidden w-32 shrink-0 truncate text-xs text-muted-foreground sm:block">
                        {/* Unassigned is a state worth naming, not a blank. */}
                        {job.technician?.name ?? "Unassigned"}
                      </span>
                      {/*
                        Value via `Computed<T>` — a job whose value could not be
                        derived renders an em-dash, never ₹0. A zero here would
                        be read as a free job.
                      */}
                      {/* `w-28` fits ₹1,18,000.00 — the Indian grouping puts a
                          separator every two digits above the thousand, so a
                          column sized for ₹99,999.99 clips a lakh. */}
                      <span className="w-28 shrink-0 text-right tabular-nums">
                        {value === null ? (
                          <span className="text-muted-foreground">
                            {EM_DASH}
                          </span>
                        ) : (
                          <span
                            className={
                              value.ok ? undefined : "text-muted-foreground"
                            }
                          >
                            {renderComputed(value, (paise) =>
                              formatMoney(paise),
                            )}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
                {rows.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    No jobs match {filter === null ? "this view" : FILTER_LABEL[filter]}.
                  </p>
                ) : null}
              </Panel>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
