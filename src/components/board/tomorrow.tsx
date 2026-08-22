"use client";

import Link from "next/link";
import { CalendarClock, Check, MessageCircleOff, TriangleAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Panel, ValuePill } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { Board } from "@/lib/data/board";

/**
 * Tomorrow, the evening before.
 *
 * **What this replaces.** The board's `Today | Tomorrow | This week` control
 * was live, moved the highlight and filtered nothing — the API sent a count of
 * tomorrow's jobs and none of the rows. So the one screen a coordinator opens
 * at six in the evening could tell her *fourteen* and not *which*.
 *
 * **The one decision it answers:** *what will go wrong tomorrow if I do
 * nothing tonight?* There are exactly two ways it can, and they are the two
 * things this sorts to the top:
 *
 * 1. **Nobody is assigned** — a visit with no technician does not happen.
 * 2. **The customer has not been told** — a visit nobody expects meets a locked
 *    gate, and in this business an unperformed visit is an uninvoiced one.
 *
 * Everything already handled sits below, quietly, because it needs nothing.
 */

type TomorrowJob = Board["tomorrow"][number];

/**
 * Worst first.
 *
 * Unassigned outranks untold: a job with nobody going is broken however well
 * the customer was informed, and telling somebody to expect a visit that cannot
 * happen is worse than saying nothing.
 */
function rank(job: TomorrowJob): number {
  if (!job.technician) return 0;
  if (job.customerTold === "failed") return 1;
  if (job.customerTold === null) return 2;
  if (job.customerTold === "pending") return 3;
  return 4;
}

function ToldMark({ state }: { state: TomorrowJob["customerTold"] }) {
  if (state === "sent") {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <Check className="size-3.5" aria-hidden="true" />
        Told
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-destructive">
        <MessageCircleOff className="size-3.5" aria-hidden="true" />
        Not told — ring them
      </span>
    );
  }
  if (state === "pending") {
    return <span className="text-xs text-muted-foreground">Reminder queued</span>;
  }
  // Null is not "no reminder is needed"; it is "none has been raised", which is
  // a different thing and the reader has to be able to tell them apart.
  return <span className="text-xs text-warning">No reminder raised</span>;
}

export function TomorrowBoard({
  jobs,
  dayWords,
}: {
  jobs: readonly TomorrowJob[];
  dayWords: string;
}) {
  if (jobs.length === 0) {
    return (
      <Card className="p-6 text-center">
        <CalendarClock
          aria-hidden="true"
          className="mx-auto mb-2 size-6 text-muted-foreground"
        />
        <p className="text-sm font-medium">Nothing booked for {dayWords}.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Contract visits appear here as their date approaches. If that looks
          wrong, check the contracts still have visits left to run.
        </p>
      </Card>
    );
  }

  const ordered = [...jobs].sort((a, b) => rank(a) - rank(b) || a.slot.localeCompare(b.slot));
  const unassigned = jobs.filter((j) => !j.technician);
  const untold = jobs.filter((j) => j.customerTold === "failed" || j.customerTold === null);

  return (
    <div className="space-y-4">
      {/*
        The sentence first, then the list.

        A count alone ("14 tomorrow") is the thing the board already said and
        nobody could act on. What earns the space is the count *plus* what is
        wrong with it — and it holds at every size, from one job to two hundred,
        which a bare list does not.
      */}
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-lg font-semibold">
            {jobs.length} visit{jobs.length === 1 ? "" : "s"} on {dayWords}
          </p>
          {unassigned.length > 0 ? (
            <ValuePill tone="warn">{unassigned.length} unassigned</ValuePill>
          ) : (
            <ValuePill tone="good">All assigned</ValuePill>
          )}
          {untold.length > 0 ? (
            <ValuePill tone="bad">{untold.length} not told</ValuePill>
          ) : (
            <ValuePill tone="good">All told</ValuePill>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {unassigned.length + untold.length === 0
            ? "Nothing needs doing tonight."
            : "Worst first — a visit nobody is going to, or nobody is expecting."}
        </p>
      </Card>

      <Panel title="Tomorrow" icon={CalendarClock} caption={`${jobs.length} scheduled`}>
        <ul>
          {ordered.map((job) => {
            const broken = !job.technician;
            return (
              <li
                key={job.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-4 py-3 last:border-0",
                  // A left rule rather than a filled row: the row stays readable
                  // and the eye still lands on the broken ones first.
                  broken && "border-l-2 border-l-warning bg-warning/5",
                )}
              >
                <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {job.slot}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/jobs/${job.jobNumber}`}
                      className="font-medium hover:underline"
                    >
                      {job.customer}
                    </Link>
                    <span className="text-xs text-muted-foreground tnum-id">
                      {job.jobNumber}
                    </span>
                    {job.visit ? (
                      <span className="text-xs text-muted-foreground">
                        Visit {job.visit.n ?? "—"} of {job.visit.of ?? "—"}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    <span>{job.locality}</span>
                    <span>·</span>
                    <span>{job.serviceType}</span>
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-3">
                  <ToldMark state={job.customerTold} />
                  {job.technician ? (
                    <span className="text-sm">{job.technician.name}</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/jobs/${job.jobNumber}`} />}
                      nativeButton={false}
                    >
                      <UserPlus className="size-3.5" />
                      Assign
                    </Button>
                  )}
                  <StatusBadge status={job.status} />
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/*
        Said once, at the bottom, rather than on every row: the reminder is
        automatic, so the reader only needs telling when it did not work.
      */}
      {untold.length > 0 ? (
        <p className="flex items-start gap-2 px-1 text-sm text-muted-foreground">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <span>
            Reminders go out automatically the day before and a week ahead. The{" "}
            {untold.length} above did not reach the customer — those need a phone
            call tonight.
          </span>
        </p>
      ) : null}
    </div>
  );
}
