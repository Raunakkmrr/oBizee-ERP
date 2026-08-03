"use client";

import Link from "next/link";
import { ChevronRight, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeSnapshot } from "@/lib/data/home";

/**
 * The day masthead — the primary screen's identity surface.
 *
 * **Why this exists.** GATE V2 asks for two brands with two jobs: the vendor's
 * lives in the chrome (*who made this*), the tenant's owns the masthead of their
 * primary screen (*whose books these are*). This screen had the first and not
 * the second — a 14px grey line reading `Shakti Cooling & Services · 03 Aug`
 * that would render identically for every customer on the platform.
 *
 * **Why it does not repeat the tiles below it.** `TodaySnapshot` already carries
 * jobs, unassigned, collected and overdue as four figures. Restating them here
 * would be decoration. What the tiles cannot show is **shape**: eighteen jobs
 * with twelve done and eighteen with two done are the same tile and completely
 * different days. So the masthead's job is the progress bar — a channel the
 * numbers do not have — plus the identity and the two facts that decide whether
 * today is on track.
 *
 * The bar is segmented, not continuous, for the reason the contract bars are:
 * done / in progress / not started are three states, and a single fill can only
 * encode one of them.
 */
/** `2h 10m` — an owner reads a duration, not 130. */
function minutesAsWords(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function DayMasthead({
  businessName,
  greeting,
  dateWord,
  today,
}: {
  businessName: string;
  greeting: string;
  dateWord: string;
  today: HomeSnapshot["today"];
}) {
  const total = today.jobsToday;

  const segments = [
    { key: "done", n: today.done, className: "bg-primary-foreground" },
    { key: "doing", n: today.inProgress, className: "bg-primary-foreground/55" },
    { key: "todo", n: today.notStarted, className: "bg-primary-foreground/20" },
  ].filter((segment) => segment.n > 0);

  return (
    <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/85 p-5 text-primary-foreground">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide uppercase text-primary-foreground/80">
            {greeting} · {dateWord}
          </p>
          {/* The tenant's own name, at a size that says whose business this is. */}
          <h2 className="mt-0.5 truncate text-2xl font-semibold">
            {businessName}
          </h2>

          <div className="mt-3 max-w-md">
            <p className="text-sm tabular-nums text-primary-foreground/90">
              <span className="font-semibold text-primary-foreground">
                {today.done} of {total}
              </span>{" "}
              jobs done
              {today.inProgress > 0 ? (
                <span className="text-primary-foreground/80">
                  {" "}
                  · {today.inProgress} in progress
                </span>
              ) : null}
            </p>
            {/*
              Three states, three segments. A single fill would have to pick one
              of them, and "in progress" is exactly the one an owner reads the
              bar to find.
            */}
            <div
              className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-full bg-primary-foreground/15"
              role="img"
              aria-label={`${today.done} done, ${today.inProgress} in progress, ${today.notStarted} not started, of ${total} jobs`}
            >
              {segments.map((segment) => (
                <span
                  key={segment.key}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", segment.className)}
                  style={{ width: `${(segment.n / Math.max(1, total)) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/*
          Not a restatement of the tiles below — that was the first version of
          this block, and `Collected today` appeared twice on one screen for no
          gain. What the tiles cannot do is **take you somewhere**: this is the
          day's next action, named and one click away.

          Deliberately not a filled button. §6.13.2 allows one primary per
          screen and `Needs your call` already owns it; a translucent control on
          the gradient reads as available without competing.
        */}
        {today.unassigned > 0 ? (
          <Link
            href="/today"
            className="flex shrink-0 items-center gap-3 rounded-lg bg-primary-foreground/15 px-4 py-3 backdrop-blur-sm transition-colors hover:bg-primary-foreground/25 focus-visible:ring-3 focus-visible:ring-primary-foreground/50 focus-visible:outline-none"
          >
            <TriangleAlert className="size-5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold tabular-nums">
                {today.unassigned} unassigned
                {today.oldestUnassignedMinutes !== null
                  ? ` · oldest ${minutesAsWords(today.oldestUnassignedMinutes)}`
                  : null}
              </span>
              <span className="block text-xs text-primary-foreground/80">
                Open the board and give them to someone
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-primary-foreground/80" />
          </Link>
        ) : (
          <div className="flex shrink-0 items-center gap-2.5 rounded-lg bg-primary-foreground/15 px-4 py-3 backdrop-blur-sm">
            <CircleCheck className="size-5 shrink-0" />
            <span className="text-sm font-semibold">
              Every job today has an owner
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
