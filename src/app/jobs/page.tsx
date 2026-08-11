"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Search, Wrench, X } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColumnHeader, Panel } from "@/components/shared/panel";
import { cn } from "@/lib/utils";
import { EM_DASH, loading, renderComputed, type Query } from "@/lib/data/result";
import { formatMoney } from "@/lib/money";
import { attentionFor, ATTENTION_TONE } from "@/lib/data/attention";
import { JOBS_FILTERS, JOBS_FILTER_LABEL, getJobs, jobValue, type JobsFilter, type JobsPage } from "@/lib/data/board";

/**
 * Jobs — the searchable record of every work order, as distinct from `/today`.
 *
 * **The one decision:** *where has this job got to?* Today's board answers "who
 * goes where now"; this answers "what happened to J-2608-0431" — a different
 * question with a different shape, which is why it is a table rather than a
 * dispatch board and why it carries the job number as the leading column.
 *
 * **Everything narrowing this list happens on the server.** The search, the
 * filters and the paging are one query, because the alternatives are all
 * wrong in the same way: a list that shows fifty of five hundred rows and then
 * filters the fifty will say "no jobs match" about a job that exists, and say
 * "Unassigned (3)" when the real answer is ninety. The screen only ever counts
 * what the register counted.
 */

/**
 * A quarter of a second after the last keystroke.
 *
 * Long enough that typing "Kumari" is one request rather than six, short
 * enough that it still feels like the list is following along.
 */
const DEBOUNCE_MS = 250;

const PAGE_SIZE = 50;

/**
 * The table's columns, measured against the **panel** rather than the window.
 *
 * This row was `flex` with six fixed widths and `sm:`/`md:` visibility, and it
 * broke the moment a sixth column arrived: the breakpoints ask how wide the
 * *window* is, while the thing actually running out of room is the panel beside
 * a 300 px sidebar. At 831 px the window says "medium, show everything" and the
 * 527 px panel then wrapped six columns onto three lines with the headers
 * overlapping each other.
 *
 * Container queries ask the right question. The grid gains a column at each
 * step, in DOM order, so the template and the visibility rules cannot disagree:
 *
 * | Panel width | Columns |
 * |---|---|
 * | any | number · customer · status |
 * | ≥ 32rem | + billed |
 * | ≥ 42rem | + when |
 * | ≥ 56rem | + technician |
 *
 * Nothing is lost when a column is dropped — the date and the technician fold
 * into the customer cell, because *when* and *who* are the two facts this
 * screen exists to show and a narrow window is not a reason to hide them.
 */
const GRID = [
  "grid items-center gap-x-3",
  "grid-cols-[7rem_minmax(0,1fr)_6.5rem]",
  "@lg:grid-cols-[7rem_minmax(0,1fr)_6.5rem_7rem]",
  "@2xl:grid-cols-[7rem_minmax(0,1fr)_6.5rem_6.5rem_7rem]",
  "@4xl:grid-cols-[7rem_minmax(0,1fr)_6.5rem_6.5rem_8rem_7rem]",
].join(" ");

export default function JobsPage() {
  const [query, setQuery] = useState<Query<JobsPage>>(loading());
  /**
   * `null` is "everything". It is deliberately *not* a sixth member of
   * §6.4.1's board union: that union has no total because the board must never
   * offer one. A record list may show everything — it borrows the vocabulary
   * rather than widening the board's rule.
   */
  const [filter, setFilter] = useState<JobsFilter | null>(null);

  /*
    Two pieces of state for one box.

    `typed` is what the reader sees and controls; `search` is what has actually
    been asked of the server. Driving the request straight off `typed` would
    fire on every keystroke, and driving the box off `search` would make it lag
    behind the fingers — the two jobs genuinely conflict, so they get a field
    each.
  */
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  // A new question starts at the first page. Staying on page three of the old
  // result while asking a new one shows an empty list and no reason for it.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setOffset(0);
  }, [search, filter]);

  useEffect(() => {
    let cancelled = false;
    void getJobs({
      q: search || undefined,
      filter: filter ?? undefined,
      limit: PAGE_SIZE,
      offset,
    }).then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, [search, filter, offset]);

  const today = useMemo(() => new Date(), []);

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
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

        {/*
          One box over five fields. The placeholder names them because a search
          box that does not say what it searches gets tried once with the wrong
          thing and never again.
        */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Search job number, customer, locality, technician or phone"
            aria-label="Search work orders"
            className="pl-9"
          />
          {typed ? (
            <button
              type="button"
              onClick={() => setTyped("")}
              aria-label="Clear the search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {[null, ...JOBS_FILTERS].map((value) => (
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
              {value === null ? "All" : JOBS_FILTER_LABEL[value]}
            </button>
          ))}
        </div>

        <QueryBoundary query={query} label="jobs" loadingRows={8}>
          {(data) => (
            <Panel
              title={filter === null ? "All work orders" : JOBS_FILTER_LABEL[filter]}
              icon={Wrench}
              count={data.total}
              caption={
                data.total > data.jobs.length
                  ? `Showing ${data.offset + 1}–${data.offset + data.jobs.length} of ${data.total}`
                  : "Newest first — the record, not the dispatch board"
              }
              flush
              className="@container"
            >
              <ColumnHeader className={GRID}>
                <span>Number</span>
                <span>Customer</span>
                <span className="hidden @2xl:block">When</span>
                <span>Status</span>
                <span className="hidden @4xl:block">Technician</span>
                <span className="hidden text-right @lg:block">Billed</span>
              </ColumnHeader>
              {data.jobs.map((job) => {
                const value = jobValue(job);
                const attention = attentionFor(job, today);
                /* The chip is rendered in two places at two widths, never both. */
                const chip = attention ? (
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-px text-[10px] font-medium",
                      ATTENTION_TONE[attention.kind],
                    )}
                    title={attention.reason}
                  >
                    {attention.word}
                  </span>
                ) : null;

                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.jobNumber}`}
                    className={cn(
                      GRID,
                      "px-4 py-2.5 text-sm transition-colors odd:bg-white/[0.018] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    )}
                  >
                    <span className="truncate text-xs text-muted-foreground tnum-id">
                      {job.jobNumber}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate font-medium">{job.customer}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {job.locality} · {job.serviceType}
                      </p>
                      {/*
                        What the dropped columns were carrying.

                        When the panel is too narrow for its own When and
                        Technician columns, the two facts fold in here rather
                        than disappearing — a work order that does not say when
                        it happens or who is going is the exact complaint this
                        screen exists to answer.
                      */}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground @2xl:hidden">
                        <span className="tabular-nums">{job.scheduledDate ?? "No date"}</span>
                        {chip}
                      </p>
                      <p className="text-xs text-muted-foreground @4xl:hidden">
                        {job.technician?.name ?? "Unassigned"}
                      </p>
                    </div>

                    {/*
                      The date, and what is wrong with it.

                      This column did not exist. The API had always returned
                      `scheduledDate` and the schema dropped it, so a screen
                      listing work orders could not say when any of them
                      happened — which also meant nothing could be marked late.
                    */}
                    <span className="hidden min-w-0 @2xl:block">
                      <span className="block text-xs tabular-nums">
                        {job.scheduledDate ?? (
                          <span className="text-muted-foreground">{EM_DASH}</span>
                        )}
                      </span>
                      {chip}
                    </span>

                    <span className="min-w-0">
                      <StatusBadge status={job.status} kind="job" className="text-[11px]" />
                    </span>

                    <span className="hidden min-w-0 truncate text-xs @4xl:block">
                      {/* Unassigned is a state worth naming, not a blank — and
                          on a job that is due, worth naming in a colour. */}
                      {job.technician?.name ?? (
                        <span
                          className={
                            attention?.kind === "unassigned" || attention?.kind === "overdue"
                              ? "text-warning"
                              : "text-muted-foreground"
                          }
                        >
                          Unassigned
                        </span>
                      )}
                    </span>

                    {/*
                      Value via `Computed<T>` — a job whose value could not be
                      derived renders an em-dash, never ₹0. A zero here would be
                      read as a free job.

                      `7rem` fits ₹1,18,000.00: Indian grouping puts a separator
                      every two digits above the thousand, so a column sized for
                      ₹99,999.99 clips a lakh.
                    */}
                    <span className="hidden min-w-0 text-right tabular-nums @lg:block">
                      {value === null ? (
                        <span className="text-muted-foreground">{EM_DASH}</span>
                      ) : (
                        <span className={value.ok ? undefined : "text-muted-foreground"}>
                          {renderComputed(value, (paise) => formatMoney(paise))}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}

              {data.jobs.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  {data.query
                    ? `Nothing matches “${data.query}”${filter ? ` in ${JOBS_FILTER_LABEL[filter]}` : ""}.`
                    : `No jobs in ${filter === null ? "this view" : JOBS_FILTER_LABEL[filter]}.`}
                </p>
              ) : null}

              {/*
                Paging, stated in rows rather than page numbers.

                "51–100 of 284" is checkable against the list on screen; "page 2
                of 6" is not, and the count is the thing somebody came here to
                trust.
              */}
              {data.total > data.jobs.length ? (
                <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {data.offset + 1}–{data.offset + data.jobs.length} of {data.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.offset === 0}
                      onClick={() => setOffset(Math.max(0, data.offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!data.hasMore}
                      onClick={() => setOffset(data.offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </Panel>
          )}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
