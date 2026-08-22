"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { TriageCard } from "@/components/board/triage-card";
import { Card } from "@/components/ui/card";
import { TomorrowBoard } from "@/components/board/tomorrow";
import { EscalationBand } from "@/components/board/escalation-band";
import { seedRatings } from "@/lib/data/feedback";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Illustration } from "@/components/shared/illustration";
import { cn } from "@/lib/utils";
import { loading, type Query } from "@/lib/data/result";
import { getBoard, restOfDay, triageJobs, type Board, type JobRow, type Technician } from "@/lib/data/board";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
import { useCurrentUser } from "@/lib/data/use-session";
import { assignJob } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";
import { can } from "@/lib/roles";

/**
 * Today — the dispatch board. PRD §6.4.
 *
 * **The one decision:** *what is not going to happen today unless I do
 * something?*
 *
 * This is a redesign rather than a restyle, and three specific things were
 * wrong with what it replaces:
 *
 * 1. **The counter strip mixed problems with facts.** `Unassigned 3` is a task;
 *    `En route 2` is the day happening correctly. Two of five items being noise
 *    teaches a coordinator to skip the row — and then she skips the three that
 *    mattered too.
 * 2. **Assignment spanned two panels.** `[Assign]` on a row put a panel forty
 *    percent across the screen into a different mode, and below 1280px that
 *    panel is under the fold — so the product's core loop broke on the
 *    commonest laptop in the market.
 * 3. **Fifteen rows, one flat list, identical weight.** "Worst first" existed
 *    only in the sort order; a breakdown two hours late rendered exactly like a
 *    signed-off job. Sorting is not showing.
 *
 * So the screen now leads with the exceptions and *only* the exceptions, each
 * carrying its own fix inside it, and demotes the rest of the day to collapsed
 * reference. The consequence worth having: **the board shrinks as the day gets
 * handled**, which is what a work queue should do and what a wall of counters
 * can never do.
 *
 * §6.4.4's 44px density contract still binds the reference rows. It does not
 * bind the triage cards — there are rarely more than a handful, and each is a
 * decision rather than a line of reference.
 */
const VIEWS = ["Today", "Tomorrow", "This week"] as const;

export default function TodayBoardPage() {
  const [query, setQuery] = useState<Query<Board>>(loading());
  const assign = useMutation(assignJob);
  // Subscribing keeps this screen live when another surface writes.
  const [view, setView] = useState<(typeof VIEWS)[number]>("Today");
  const [hideAmounts, setHideAmounts] = useState(false);
  const [openSlots, setOpenSlots] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    getBoard().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();
  /*
    `24 Aug` — the reader is deciding about a specific day, not "tomorrow".

    Derived from `today` rather than calling `Date.now()` again: the React
    Compiler refuses an impure call in render, and two clock reads in one render
    can straddle midnight and label the list with the wrong day.
  */
  const tomorrowWords = new Date(today.getTime() + 86_400_000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  const canAssign = can(CURRENT_USER.role, "job:dispatch");
  const board = query.status === "ready" ? query.data : null;

  /*
    Held locally rather than in the store: a rating is an inbound fact from the
    technician app, and until that surface and its sync exist there is nothing
    for the store to be the source of truth *about*. Acknowledging is real —
    it just does not survive a reload yet, and pretending otherwise would be
    the fabricated-record problem again.
  */
  const [ratings, setRatings] = useState(() => seedRatings(new Date()));
  const me = useCurrentUser();

  const triage = useMemo(() => (board ? triageJobs(board.jobs) : []), [board]);
  const rest = useMemo(() => (board ? restOfDay(board.jobs) : []), [board]);

  /*
    Refetch rather than patch the row in place. Assigning changes more than the
    name on one card — the unassigned counter, the technician's job count and
    his localities all move with it, and a locally patched row would leave the
    counters describing a board that no longer exists.
  */
  async function handleAssign(job: JobRow, technician: Technician) {
    const result = await assign.run(job.id, { primaryTechnicianId: technician.id });
    if (result?.ok) setQuery(await getBoard());
  }

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
      badges={{ unassigned_today: board?.counters.unassigned, leads_overdue: 7 }}
      hideAmounts={hideAmounts}
      onToggleAmounts={() => setHideAmounts((v) => !v)}
    >
      {assign.error ? (
        <div className="px-3 pt-3 lg:px-4">
          <ErrorState error={assign.error} onRetry={assign.reset} />
        </div>
      ) : null}
      {/* Date + view bar, 48px (§6.4.1). */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 lg:px-4">
        {/*
          Disabled rather than dead: there is exactly one day of data behind
          this screen, so stepping to another would show today's jobs under
          yesterday's date — a lie that looks like a working control.
        */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous day — unavailable: only today's jobs are loaded"
          disabled
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next day — unavailable: only today's jobs are loaded"
          disabled
        >
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
                "rounded-lg px-2.5 py-1 text-sm transition-all duration-200",
                "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                view === v
                  ? "bg-card font-medium text-foreground shadow-[var(--shadow-card)]"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {/*
          Secondary, and always in the bar — §6.4.1: "never in a floating button
          and never in a menu". Assigning is this screen's primary.
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
        segments, so §6.4.7 moves it to a pinned bottom-right pill — and is
        explicit that it stays a *labelled* pill, never a bare `+` icon: an
        unlabelled FAB is a guess, and this is the action that creates revenue.
      */}
      <Button
        size="sm"
        variant="outline"
        className="fixed right-4 bottom-4 z-[var(--z-sticky)] rounded-full shadow-[var(--shadow-raised)] sm:hidden"
        render={<Link href="/jobs/new" />}
        nativeButton={false}
      >
        <Plus className="size-4" />
        Create job
      </Button>

      <QueryBoundary query={query} label="today's jobs" loadingRows={8}>
        {(data) => (
          <div className="grid gap-5 p-3 pb-20 sm:pb-3 lg:p-4 xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-3">
              {/*
                FR-1205 sits above the job triage on purpose. A late job is a
                problem the day can absorb; a customer who has just rated the
                visit 1★ is one somebody has sixty seconds to reach.
              */}
              {/*
                The view segments used to change only their own highlight.

                `view` was read for `aria-pressed` and nowhere else, so
                "Tomorrow" showed today's work — on the one screen whose whole
                job is telling a coordinator what is coming.
              */}
              {view === "Tomorrow" ? (
                <TomorrowBoard jobs={data.tomorrow} dayWords={tomorrowWords} />
              ) : view === "This week" ? (
                /* Honest rather than empty: the board loads two days, and
                   pretending otherwise is how the Tomorrow tab shipped dead. */
                <Card className="p-6 text-center">
                  <p className="text-sm font-medium">The week is not loaded yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Today and tomorrow come from the board. A seven-day view needs
                    the range the API does not serve yet — it is not built, rather
                    than empty.
                  </p>
                </Card>
              ) : (
              <>
              <div className="mb-5 empty:hidden">
                <EscalationBand
                  ratings={ratings}
                  onAcknowledge={(jobNumber) =>
                    setRatings((prev) =>
                      prev.map((rating) =>
                        rating.jobNumber === jobNumber
                          ? { ...rating, acknowledgedBy: me?.name ?? "" }
                          : rating,
                      ),
                    )
                  }
                />
              </div>

              <SectionHeading
                title="Needs you now"
                count={triage.length}
                caption="Everything else today is running to plan"
              />

              {triage.length === 0 ? (
                <DayIsClear
                  handled={data.jobs.length}
                  leadsDue={data.leadsDueToday}
                />
              ) : (
                <div className="grid gap-2.5">
                  {triage.map(({ job, reason }) => (
                    <TriageCard
                      key={job.id}
                      job={job}
                      reason={reason}
                      technicians={data.technicians}
                      canAssign={canAssign}
                      onAssign={handleAssign}
                      busy={assign.pending}
                    />
                  ))}
                </div>
              )}

              <SectionHeading
                className="mt-7"
                title="The rest of the day"
                count={rest.reduce((sum, group) => sum + group.jobs.length, 0)}
                caption="Collapsed on purpose — open a slot only if you need it"
              />

              <div className="grid gap-2">
                {rest.map((group) => (
                  <SlotGroup
                    key={group.slot}
                    slot={group.slot}
                    jobs={group.jobs}
                    open={openSlots[group.slot] ?? false}
                    onToggle={() =>
                      setOpenSlots((prev) => ({
                        ...prev,
                        [group.slot]: !(prev[group.slot] ?? false),
                      }))
                    }
                  />
                ))}
              </div>
              </>
              )}
            </div>

            {/* Capacity, not a roster. Who has room, at a glance. */}
            <div className="min-w-0 xl:col-span-2">
              <SectionHeading
                title="Who is free"
                count={
                  data.technicians.filter((t) => t.status.kind === "free").length
                }
                caption="Load today, and where they already are"
              />
              <div className="grid gap-2">
                {data.technicians.map((tech) => (
                  <CapacityRow key={tech.id} tech={tech} />
                ))}
              </div>
            </div>
          </div>
        )}
      </QueryBoundary>
    </AppShell>
  );
}

function SectionHeading({
  title,
  count,
  caption,
  className,
}: {
  title: string;
  count: number;
  caption: string;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-2.5 flex flex-wrap items-baseline gap-x-2", className)}
    >
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
        {count}
      </span>
      <p className="w-full text-xs text-muted-foreground sm:w-auto">{caption}</p>
    </div>
  );
}

/**
 * The empty state a triage board earns.
 *
 * Not "no jobs today" — there are fifteen. The message is that none of them
 * need her, which is a different and far better sentence, and it is the moment
 * the screen should point somewhere useful rather than congratulate itself.
 */
function DayIsClear({
  handled,
  leadsDue,
}: {
  handled: number;
  leadsDue: number;
}) {
  return (
    <div className="rounded-xl bg-card p-6 text-center shadow-[var(--shadow-card)]">
      <Illustration name="jobs" width={150} className="mx-auto mb-2" />
      <p className="flex items-center justify-center gap-2 font-medium">
        <CheckCircle2 className="size-4 text-success" />
        Nothing needs you right now
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        All {handled} jobs are assigned, on time and unblocked.
      </p>
      {leadsDue > 0 ? (
        <Button
          size="sm"
          className="mt-3"
          render={<Link href="/leads" />}
          nativeButton={false}
        >
          {leadsDue} leads are due for follow-up
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One slot of the day, collapsed.
 *
 * The header alone answers the only question a coordinator has about a slot she
 * is not worried about — how many, and who is on them — so opening it is a
 * choice rather than the price of reading the screen.
 */
function SlotGroup({
  slot,
  jobs,
  open,
  onToggle,
}: {
  slot: string;
  jobs: JobRow[];
  open: boolean;
  onToggle: () => void;
}) {
  const people = new Set(
    jobs.flatMap((job) => (job.technician ? [job.technician.name] : [])),
  );

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span className="font-medium tabular-nums">{slot}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {people.size === 0
            ? "nobody assigned"
            : [...people].map((name) => name.split(" ")[0]).join(", ")}
        </span>
      </button>

      {open ? (
        <div>
          {jobs.map((job) => (
            /* 44px — the density contract §6.4.4 binds to reference rows. */
            <Link
              key={job.id}
              href={`/jobs/${job.jobNumber}`}
              className="flex h-11 items-center gap-3 px-4 text-sm transition-colors odd:bg-muted-bg hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{job.customer}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {job.serviceType}
                </span>
              </span>
              <StatusBadge status={job.status} />
              <span className="hidden w-28 shrink-0 truncate text-right text-muted-foreground sm:block">
                {job.technician?.name ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A technician as capacity.
 *
 * §6.4.3: the *duration* is what says whether he is nearly free, so `on site
 * since 11:42` is load-bearing rather than decorative. Someone on leave is
 * dimmed — he is not a choice, and giving him a card the same weight as an
 * available technician was the old panel's mistake.
 */
function CapacityRow({ tech }: { tech: Technician }) {
  const away = tech.status.kind === "leave";
  const free = tech.status.kind === "free";

  return (
    <div
      className={cn(
        "rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-card)]",
        away && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{tech.name}</span>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
            free
              ? "bg-success-bg text-success"
              : away
                ? "bg-muted text-muted-foreground"
                : "bg-primary-bg text-primary-text",
          )}
        >
          {free
            ? "Free"
            : away
              ? "On leave"
              : `${tech.status.kind === "on_site" ? "On site" : "En route"}${
                  tech.status.since ? ` since ${tech.status.since}` : ""
                }`}
        </span>
      </div>

      {!away ? (
        <>
          {/* Load as a shape as well as a number — five bars is a glance. */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    index < tech.jobsToday ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {tech.jobsToday} today
            </span>
          </div>

          {tech.localities.length > 0 ? (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {tech.localities.join(" · ")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
