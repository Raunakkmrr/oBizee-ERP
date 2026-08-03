"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EM_DASH, loading, renderComputed, type Query } from "@/lib/data/result";
import { formatMoney } from "@/lib/money";
import {
  BOARD_FILTERS,
  FILTER_LABEL,
  getBoard,
  jobValue,
  matchesFilter,
  type Board,
  type BoardFilter,
} from "@/lib/data/board";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
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
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-3"
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
                "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                filter === value
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border hover:bg-muted",
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
              <Card className="gap-0 overflow-hidden py-0">
                {rows.map((job) => {
                  const value = jobValue(job);
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.jobNumber}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2.5 text-sm last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
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
                      <StatusBadge
                        status={job.status}
                        kind="job"
                        className="shrink-0 text-[11px]"
                      />
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
              </Card>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
