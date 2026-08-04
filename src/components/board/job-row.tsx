"use client";

import Link from "next/link";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { jobStateTone, railClasses, toneClasses } from "@/lib/design/tokens";
import type { JobRow as JobRowData } from "@/lib/data/board";

/**
 * One job row — PRD §6.4.2, at the **44px / two-line** budget.
 *
 * §6.4.4 makes this the **binding density constraint for the whole product**:
 * at 1366×768 there are 440px left after the chrome, and 44px rows guarantee ten
 * jobs above the fold. "If a row grows to 52px we lose two rows and the screen
 * stops being an overview." So the height is fixed rather than content-driven,
 * and the two lines are 18px + 16px inside 5px of vertical padding.
 *
 * **What is deliberately not here** (§6.4.2): full address, phone numbers, work
 * description, part list, GSTIN, created-at, created-by. Each is one click away
 * in the drawer, and including any of them would halve rows-per-screen.
 *
 * **Below `sm` this is a different shape, not a squeezed row.** §6.4.7 specifies
 * a **96px three-line card**: slot + number + status / customer + locality /
 * service + assignee or a full-width 48dp [Assign]. The row form cannot survive
 * 390px — its fixed slot, status and 144px trailing columns leave the flexible
 * middle nothing, and the board overflowed the viewport by 18px until this was
 * measured. Two layouts share one set of derived values; neither compromises
 * the other to accommodate the other's breakpoint.
 */

function SlaChip({ sla }: { sla: NonNullable<JobRowData["sla"]> }) {
  // A word plus a shape, never a bare colour (§6.4.2, §6.13.4 P3).
  const tone = sla.kind === "late" ? "danger" : "warning";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-px text-[11px] leading-4 font-medium tabular-nums",
        toneClasses[tone],
      )}
    >
      {sla.word}
    </span>
  );
}

function VisitLabel({ visit }: { visit: NonNullable<JobRowData["visit"]> }) {
  // §6.4.5: a failed contract lookup renders `Visit —/—`, never `Visit 0/0` —
  // a fabricated zero would read as a contract with no visits delivered.
  const unknown = visit.n === null || visit.of === null;
  return (
    <span
      className="shrink-0 tabular-nums"
      title={
        unknown ? "Contract data unavailable for this job" : undefined
      }
    >
      {unknown ? "Visit —/—" : `Visit ${visit.n}/${visit.of}`}
    </span>
  );
}

export function JobRow({
  job,
  onAssign,
  canAssign,
  isPrimaryAssign = false,
}: {
  job: JobRowData;
  onAssign: (job: JobRowData) => void;
  canAssign: boolean;
  /**
   * True for the **highest-priority unassigned row only**.
   *
   * §6.4.6: "[Assign] on the highest-priority unassigned row. Secondary action:
   * [+ Create job]. **Nothing else on this screen is styled as a primary
   * button.**" Every unassigned row rendered a filled button until this was
   * seen at full resolution in Chrome — four primaries, which §6.13.2 calls a
   * defect because it "destroys the only cue that tells a hurried user where to
   * go".
   */
  isPrimaryAssign?: boolean;
}) {
  const firstName = job.technician?.name.split(" ")[0] ?? null;

  const assignButton = (
    // The row's primary action lives in the row (§6.4.2). Never a hover
    // reveal, never a kebab — §2.2 makes hidden navigation a non-goal.
    <Button
      size="sm"
      variant={isPrimaryAssign ? "default" : "outline"}
      onClick={() => onAssign(job)}
      disabled={!canAssign}
      aria-label={`Assign ${job.jobNumber} to a technician`}
    >
      Assign
    </Button>
  );

  return (
    <>
      {/* ---------------------------- 390px: a 96px card (§6.4.7) ---------- */}
      <div className="flex min-h-24 flex-col justify-center gap-1 border-b px-3 py-2 text-sm sm:hidden">
        <div className="flex items-center gap-2">
          <span className="shrink-0 select-all text-xs text-muted-foreground tnum-id">
            {job.jobNumber}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {job.slot}
          </span>
          <StatusBadge status={job.status} className="ml-auto shrink-0" />
        </div>

        <Link
          href={`/jobs/${encodeURIComponent(job.jobNumber)}`}
          className="min-w-0 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Open ${job.jobNumber}, ${job.customer}`}
        >
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{job.customer}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {job.locality}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{job.serviceType}</span>
            {job.sla ? <SlaChip sla={job.sla} /> : null}
            {job.priority !== "normal" ? (
              <span className="flex shrink-0 items-center gap-0.5 font-medium text-destructive">
                <Flag className="size-3" aria-hidden="true" />
                {job.priority === "breakdown" ? "Breakdown" : "Urgent"}
              </span>
            ) : null}
          </div>
        </Link>

        {firstName ? (
          <span className="truncate text-xs text-muted-foreground">
            {firstName}
          </span>
        ) : (
          // §6.4.7: a **full-width 48dp** button — the whole point of the card
          // form is that the one action on an unassigned job is thumb-sized.
          <Button
            size="sm"
            className="h-12 w-full"
            variant={isPrimaryAssign ? "default" : "outline"}
            onClick={() => onAssign(job)}
            disabled={!canAssign}
            aria-label={`Assign ${job.jobNumber} to a technician`}
          >
            Assign
          </Button>
        )}
      </div>

      {/* ---------------------------- ≥640px: the 44px row (§6.4.4) -------- */}
      <div className="relative hidden h-11 items-center gap-3 border-b pr-3 pl-4 text-sm transition-colors hover:bg-muted/50 sm:flex">
        {/* The rail. Lets the eye find the three rows that need her without
            reading fifteen. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            railClasses[jobStateTone[job.status]?.tone ?? "muted"],
          )}
        />

        {/* Slot — the coordinator plans in slots; absolute times force mental
            arithmetic on every row (§6.4.2). A filled chip rather than bare
            text, so the time column has an edge to scan down. */}
        <span className="w-14 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-center text-[11px] font-medium text-muted-foreground tabular-nums">
          {job.slot}
        </span>

      {/*
        The row opens the job. §6.5 wants this as a 640px drawer over a dimmed
        board with the URL updating so the job is shareable on WhatsApp; this is
        the URL half, and the drawer is a deferred presentation change over
        content that is already correct.

        The job number keeps `select-all` so it can still be copied for reading
        aloud without navigating — a link that swallows the copy gesture would
        break the thing §6.4.2 put the number there for.
      */}
      <Link
        href={`/jobs/${encodeURIComponent(job.jobNumber)}`}
        className="min-w-0 flex-1 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Open ${job.jobNumber}, ${job.customer}`}
      >
        <div className="flex items-center gap-2 leading-[18px]">
          {/* Selectable so it copies in one gesture — read aloud on the phone
              twenty times a day (§6.4.2, FR-210). */}
          <span className="shrink-0 select-all text-xs text-muted-foreground tnum-id">
            {job.jobNumber}
          </span>
          {/*
            Line 1 is reserved for identification: job number and customer.
            The priority flag used to sit here and pushed "Shakti Industries" —
            a 17-character name — into an ellipsis, which defeats the reason
            §6.4.2 puts the customer in the row at all ("recognition. Regular
            customers get different treatment."). Priority moved to line 2 with
            the other qualifiers.
          */}
          {/* The name carries the weight; everything else steps down. One type
              size for all five fields is why the row read as a spreadsheet. */}
          <span className="truncate text-[15px] leading-5 font-semibold">
            {job.customer}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
          {job.priority !== "normal" ? (
            <>
              {/* Word + shape + colour, never colour alone (§6.13.4). */}
              <span className="flex shrink-0 items-center gap-0.5 font-medium text-destructive">
                <Flag className="size-3" aria-hidden="true" />
                {job.priority === "breakdown" ? "Breakdown" : "Urgent"}
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          {/*
            Locality, not the full address — locality is "what makes two jobs
            clusterable" (§6.4.2), and clustering is most of a dispatcher's
            craft. It therefore holds its width and the service type absorbs the
            squeeze: when the row is tight, knowing *where* beats knowing
            *what*, because the service type is also implied by the job's status
            and is one click away in the drawer.
          */}
          <span className="max-w-[9rem] shrink-0 truncate">{job.locality}</span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{job.serviceType}</span>
          {job.visit ? (
            <>
              <span aria-hidden="true">·</span>
              <VisitLabel visit={job.visit} />
            </>
          ) : null}
          {job.visitAttempt > 1 ? (
            <>
              <span aria-hidden="true">·</span>
              {/* A second attempt is a customer already let down once. */}
              <span className="shrink-0 font-medium text-brand-brown tabular-nums">
                Visit {job.visitAttempt}
              </span>
            </>
          ) : null}
        </div>
      </Link>

      {job.sla ? <SlaChip sla={job.sla} /> : null}

      <StatusBadge status={job.status} className="shrink-0" />

        <div className="flex w-36 shrink-0 items-center justify-end gap-2">
          {firstName ? (
            <>
              <span className="truncate text-xs text-muted-foreground">
                {firstName}
              </span>
              {/* A face, not just a name. Fifteen rows of plain text have no
                  rhythm; the avatar gives each row an anchor and makes "who
                  has three of these" visible by repetition. */}
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                {job.technician?.name
                  .split(" ")
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </span>
            </>
          ) : (
            assignButton
          )}
        </div>
      </div>
    </>
  );
}
