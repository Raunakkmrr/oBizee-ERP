"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Check as StageCheck, JobDetail, Stage } from "@/lib/data/job-detail";

/**
 * The job detail screen's parts, so the page can order them by stage.
 *
 * They were previously inlined in a fixed layout, which is what made the screen
 * static across the job's whole life — `Where` and `Asset` held the top row
 * whether the technician was still travelling or had finished two hours ago.
 * Extracting them is what lets the ordering become a decision rather than a
 * hard-coded grid.
 */

/* ------------------------------------------------------------ the decision */

const CHECK_ICON: Record<StageCheck["state"], LucideIcon> = {
  done: Check,
  pending: Clock,
  blocked: CircleAlert,
};

const CHECK_TONE: Record<StageCheck["state"], string> = {
  done: "text-success",
  pending: "text-warning",
  blocked: "text-destructive",
};

/**
 * The band that answers the screen's one question.
 *
 * **Why this exists.** On a finished job the only question is "can I bill
 * this?", and the old screen answered it nowhere: `Bill this job` was a
 * tertiary outline button, fourth in a row of five, while the filled primary
 * was `Send sign-off link`. The reader had to assemble the answer from a status
 * badge, a sign-off panel below the fold and a policy they had to remember.
 *
 * `pending` is rendered as a clock, not a cross. A customer who has not signed
 * yet has not refused, and colouring it as a failure would make a normal step
 * of every single job look like something went wrong.
 */
export function DecisionBand({
  stage,
  children,
}: {
  stage: Stage;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={stage.question}
      className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <h2 className="text-sm font-semibold tracking-tight">{stage.question}</h2>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {stage.checks.map((check) => {
          const Icon = CHECK_ICON[check.state];
          return (
            <li key={check.label} className="flex items-start gap-2 text-sm">
              <Icon
                aria-hidden="true"
                className={cn("mt-0.5 size-4 shrink-0", CHECK_TONE[check.state])}
              />
              <span className="min-w-0">
                <span className="block">{check.label}</span>
                {check.detail ? (
                  <span className="block text-xs text-muted-foreground">
                    {check.detail}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {children ? (
        <div className="mt-3.5 flex flex-wrap gap-2">{children}</div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------- containers */

/**
 * A section that leads: open, titled, full weight.
 *
 * No drawn head band and no rule beneath the title — the card's own surface is
 * the separation, which is the treatment the rest of the product now uses.
 */
export function Section({
  title,
  icon: Icon,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl bg-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-bg text-primary-text">
          <Icon className="size-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A section that does not lead: collapsed, with its summary in the header.
 *
 * The summary is the point. Collapsing something to a bare title makes the
 * reader open it to find out whether they needed it, which is worse than
 * leaving it open. `Where · Saket · 2 contacts` is usually the whole answer.
 */
export function CollapsedSection({
  title,
  icon: Icon,
  summary,
  children,
}: {
  title: string;
  icon: LucideIcon;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <Icon aria-hidden="true" className="size-4 shrink-0 text-primary-text" />
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </button>
      {open ? <div className="px-4 pt-1 pb-4">{children}</div> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- contents */

export function WhereBody({ job }: { job: JobDetail }) {
  return (
    <div className="space-y-3 text-sm">
      <p>{job.site.addressLine}</p>
      {job.site.landmark ? (
        // On its own line — a landmark is how an Indian address is actually
        // resolved on the ground (§6.5.1).
        <p className="font-medium">Landmark: {job.site.landmark}</p>
      ) : null}
      <p className="text-muted-foreground tabular-nums">
        {job.site.locality} {job.site.pincode}
      </p>

      <Button
        variant="outline"
        size="sm"
        render={
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(job.site.mapQuery)}`}
            target="_blank"
            rel="noreferrer"
          />
        }
        nativeButton={false}
      >
        <MapPin className="size-4" />
        Open in Maps
      </Button>

      {job.site.accessNotes ? (
        <p className="rounded-lg bg-muted p-2 text-muted-foreground">
          Access: {job.site.accessNotes}
        </p>
      ) : null}

      <ul className="space-y-2 pt-1">
        {job.site.contacts.map((contact) => (
          <li key={contact.phone} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate">
                {contact.name}{" "}
                {/* Every number carries its role label (§6.5.1). */}
                <span className="text-muted-foreground">({contact.role})</span>
              </span>
              <span className="text-muted-foreground tabular-nums">
                {contact.phone}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`Call ${contact.name}`}
              >
                <Phone className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`WhatsApp ${contact.name}`}
              >
                <MessageCircle className="size-3.5" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AssetBody({ job }: { job: JobDetail }) {
  if (!job.asset) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">No assets registered at this site.</p>
        <Button variant="outline" size="sm">
          Add asset
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">{job.asset.description}</p>
      <p className="text-muted-foreground tnum-id">
        {job.asset.serial ? `SL# ${job.asset.serial}` : null}
        {job.asset.warrantyTo ? ` · Warranty to ${job.asset.warrantyTo}` : null}
      </p>

      {job.asset.repeatFailure ? (
        <p className="flex items-center gap-2 rounded-lg bg-destructive-bg p-2 font-medium text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          Repeat failure: {job.asset.repeatFailure}
        </p>
      ) : null}

      {job.asset.lastServices.length > 0 ? (
        <>
          <p className="text-xs font-medium text-muted-foreground">
            Last 3 services
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {job.asset.lastServices.map((service) => (
              <li key={service.date} className="truncate">
                <span className="tabular-nums">{service.date}</span> ·{" "}
                {service.technician} · {service.summary}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function TimelineBody({ job }: { job: JobDetail }) {
  if (job.timeline.length === 0) {
    // A panel with nothing in it reads as a rendering failure. A job created in
    // this session genuinely has no history yet, and saying so is honest.
    return (
      <p className="text-sm text-muted-foreground">
        Nothing recorded yet — events appear here as the technician works the
        job.
      </p>
    );
  }

  return (
    <ul className="space-y-3 text-sm">
      {/* Newest first: what just happened is what she is being asked about. */}
      {[...job.timeline].reverse().map((event) => (
        <li key={event.id} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          />
          <span className="min-w-0">
            <span className="block">{event.label}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{event.at}</span>
              <span>· {event.actor}</span>
              {event.place ? <span>· {event.place}</span> : null}
              {event.offline ? (
                // §4.2 rule 3 records whether an event originated offline;
                // §9.2 makes `occurred_at` authoritative. A technician who
                // finished at 4pm in a basement did the job at 4pm.
                <span className="flex items-center gap-1 text-brand-brown">
                  <WifiOff className="size-3" aria-hidden="true" />
                  recorded offline
                </span>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PartsBody({ job }: { job: JobDetail }) {
  if (job.parts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No parts recorded on this job.
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-sm">
      {job.parts.map((part) => (
        <li key={part.name} className="flex justify-between gap-2">
          <span className="min-w-0 truncate">{part.name}</span>
          <span className="shrink-0 tabular-nums">
            {part.qty} {part.unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SignOffBody({ job }: { job: JobDetail }) {
  if (!job.signOff) {
    return (
      /*
        The reason has to follow the status rather than be asserted. This used
        to read "the technician hasn't completed the work" on every unsigned
        job — including one the header was simultaneously badging Work done.
      */
      <p className="text-sm text-muted-foreground">
        {job.status === "WORK_DONE"
          ? "Work is finished — waiting on the customer to sign."
          : job.status === "PARTS_AWAITED"
            ? "Held for parts, so there is nothing to sign yet."
            : "Not signed off yet — the work is still in progress."}
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        Signed off at <span className="tabular-nums">{job.signOff.at}</span> by{" "}
        {job.signOff.signerName}
      </p>
      <p className="text-muted-foreground tabular-nums">
        Rated {job.signOff.rating} of 5
      </p>
      {!job.signOff.signatureUploaded ? (
        // §6.5.2: this happens many times a day and "must read as normal, not
        // as an error" — so it is muted text, not an alert.
        <p className="rounded-lg bg-muted p-2 text-muted-foreground">
          Signature image still uploading from the technician&apos;s phone.
        </p>
      ) : null}
    </div>
  );
}

/* Re-exported so the page imports its icons from one place. */
export const SECTION_ICONS = {
  where: MapPin,
  asset: Package,
  timeline: Clock,
  parts: Package,
  signoff: CircleCheck,
} as const;
