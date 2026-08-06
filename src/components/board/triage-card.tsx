"use client";

import Link from "next/link";
import { Flag, PackageSearch, PhoneCall, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { telHref } from "@/lib/contact";
import { SEED_USERS } from "@/lib/data/fixtures/tenant";
import { assignCandidates, recommendTechnician, TRIAGE_LABEL, type JobRow, type Technician, type TriageReason } from "@/lib/data/board";

/**
 * One exception, with its fix inside it.
 *
 * **The defect this replaces.** Assignment used to be a cross-panel journey:
 * press `[Assign]` on a row and a *different* panel, forty percent of the way
 * across the screen, changed mode. Below 1280px that panel sits under the fold,
 * so the product's core loop — see an unassigned job, give it to someone —
 * broke on the most common laptop in the market. The candidates now live in the
 * row that needs them, and the decision never leaves the reader's eye.
 *
 * Each reason gets a different fix, because they are different problems:
 *
 * - **Unassigned** — the technicians who could take it, best first.
 * - **Late** — the job is already someone's; the useful action is to reach that
 *   person, not to reassign.
 * - **Blocked** — the part is the blocker, so the way out is the parts screen.
 *
 * §6.13.2 still holds: exactly one filled button per card, and only the
 * recommended technician gets it. When `recommendTechnician` returns `null`
 * nothing is filled, and that absence is the message — this one needs a human.
 */

const REASON_TONE: Record<TriageReason, string> = {
  late: "bg-destructive-bg text-destructive",
  unassigned: "bg-warning-bg text-warning",
  blocked: "bg-info-bg text-info",
};

/** The left rail. A shape, so the reason is not carried by colour alone. */
const REASON_RAIL: Record<TriageReason, string> = {
  late: "bg-destructive",
  unassigned: "bg-warning",
  blocked: "bg-info",
};

export function TriageCard({
  job,
  reason,
  technicians,
  canAssign,
  onAssign,
}: {
  job: JobRow;
  reason: TriageReason;
  technicians: readonly Technician[];
  canAssign: boolean;
  onAssign: (job: JobRow, tech: Technician) => void;
}) {
  // The technician's number lives on the user record, not the board row —
  // the board carries who, the directory carries how to reach them.
  const techCall = telHref(
    SEED_USERS.find((u) => u.id === job.technician?.id)?.phone,
  );
  /*
    The fix is chosen by what the job *lacks*, not by its label.

    A job can be late AND unassigned, and the first build read only the label —
    so it offered "Call technician" on a job that had no technician to call.
    Lateness is still what the badge says, because that is the fact she repeats
    on the phone; but with nobody assigned, the way out is to assign somebody.
  */
  const needsSomeone = job.technician === null;
  const recommendedId = needsSomeone
    ? recommendTechnician(job, [...technicians])
    : null;
  const candidates = needsSomeone ? assignCandidates(job, technicians) : [];

  return (
    <div className="relative overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[var(--shadow-raised)]">
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1", REASON_RAIL[reason])}
      />

      <div className="p-3.5 pl-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-semibold",
              REASON_TONE[reason],
            )}
          >
            {/* The SLA's own words when we have them — `Late 2h` says more
                than `Late`, and it is the phrase she repeats on the call. */}
            {reason === "late" && job.sla ? job.sla.word : TRIAGE_LABEL[reason]}
          </span>

          {job.priority !== "normal" ? (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive uppercase">
              <Flag className="size-3" />
              {job.priority}
            </span>
          ) : null}

          <Link
            href={`/jobs/${job.jobNumber}`}
            className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {job.jobNumber}
          </Link>

          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {job.slot}
          </span>
        </div>

        <p className="mt-1.5 truncate font-medium">{job.customer}</p>
        <p className="truncate text-sm text-muted-foreground">
          {job.locality} · {job.serviceType}
          {job.technician ? ` · ${job.technician.name}` : ""}
        </p>

        {needsSomeone ? (
          <AssignRow
            job={job}
            candidates={candidates}
            recommendedId={recommendedId}
            canAssign={canAssign}
            onAssign={onAssign}
          />
        ) : null}

        {reason === "late" && !needsSomeone ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              render={<a href={techCall ?? undefined} />}
              nativeButton={false}
              // A late job whose technician has no number on file is exactly
              // when you need one, so the disabled state names the gap.
              disabled={!techCall}
            >
              <PhoneCall className="size-4" />
              Call {job.technician?.name.split(" ")[0]}
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/jobs/${job.jobNumber}`} />}
              nativeButton={false}
            >
              Open job
            </Button>
          </div>
        ) : null}

        {reason === "blocked" && !needsSomeone ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              render={<Link href="/parts" />}
              nativeButton={false}
            >
              <PackageSearch className="size-4" />
              Find the part
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/jobs/${job.jobNumber}`} />}
              nativeButton={false}
            >
              Open job
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The technicians, as one row of chips.
 *
 * Each chip carries *why* it is offered — "in Okhla", "free", or the load —
 * because §6.4.2 calls clustering "most of a dispatcher's craft" and a bare
 * list of names throws that reasoning away. Someone without the skill is shown
 * greyed rather than hidden: sometimes he is the only body available, and
 * hiding him would make the product look broken rather than opinionated.
 */
function AssignRow({
  job,
  candidates,
  recommendedId,
  canAssign,
  onAssign,
}: {
  job: JobRow;
  candidates: ReturnType<typeof assignCandidates>;
  recommendedId: string | null;
  canAssign: boolean;
  onAssign: (job: JobRow, tech: Technician) => void;
}) {
  if (!canAssign) {
    return (
      <p className="mt-2.5 text-xs text-muted-foreground">
        {/* Named, not hidden: a coordinator who cannot dispatch still needs to
            know who to ask (§6.13.5). */}
        Ask a coordinator or the owner to assign this one.
      </p>
    );
  }

  if (candidates.length === 0) {
    return (
      <p className="mt-2.5 text-xs text-muted-foreground">
        Nobody is available today — everyone is on leave.
      </p>
    );
  }

  /*
    Repeating "no matching skill" on every chip said the same thing three times
    and buried the names. When it is true of everybody it is a fact about the
    *job*, not about each technician — so it is said once, above them.
  */
  const nobodySkilled = candidates.every((candidate) => !candidate.skilled);

  return (
    <div className="mt-2.5">
      {nobodySkilled ? (
        <p className="mb-1.5 text-xs text-muted-foreground">
          Nobody on today has the skill for {job.serviceType.toLowerCase()} —
          send the closest and brief him, or move the visit.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <UserPlus
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        {candidates.map(({ tech, inLocality, skilled }) => {
          const recommended = tech.id === recommendedId;
          const why =
            !skilled && !nobodySkilled
              ? "no matching skill"
              : inLocality
                ? `in ${job.locality.split(" ")[0]}`
                : tech.status.kind === "free"
                  ? "free"
                  : `${tech.jobsToday} today`;

          return (
            <button
              key={tech.id}
              type="button"
              onClick={() => onAssign(job, tech)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-all duration-200",
                "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                recommended
                  ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-card)]"
                  : skilled
                    ? "bg-muted text-foreground hover:bg-accent"
                    : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {tech.name.split(" ")[0]}
              <span
                className={cn(
                  "ml-1",
                  recommended ? "opacity-80" : "text-muted-foreground",
                )}
              >
                · {why}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
