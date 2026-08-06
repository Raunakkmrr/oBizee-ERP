"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleAlert, CircleCheck, Clock, MapPin, MessageCircle, Navigation, Package, PenLine, Phone, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Unavailable, NEEDS_BACKEND } from "@/components/shared/unavailable";
import { telHref, whatsappHref } from "@/lib/contact";
import { nextStepFor, type Check as StageCheck, type JobDetail, type Stage } from "@/lib/data/job-detail";

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
 * Each kind of section gets its own colour and its own shape.
 *
 * **Why.** Every section was the same white card with the same orange chip, so
 * nothing said "this is an address" or "this is a history" until you read the
 * words. On a screen whose whole job is being scanned in five seconds, that is
 * the defect — the reader was doing the sorting that the design should do.
 *
 * The hues are the ones already in the palette, used only on the chip and a
 * hairline rail, never as a filled background. One accent per *meaning*, not a
 * second colour system: blue is place, orange is the job's own spine, brown is
 * materials, amber is the machine, green is the customer's signature.
 */
export type Tone = "place" | "history" | "materials" | "machine" | "signature";

const TONE: Record<Tone, { chip: string; rail: string }> = {
  place: { chip: "bg-info/12 text-info", rail: "bg-info/60" },
  history: { chip: "bg-primary-bg text-primary-text", rail: "bg-primary/60" },
  materials: {
    chip: "bg-brand-brown/12 text-brand-brown",
    rail: "bg-brand-brown/60",
  },
  machine: { chip: "bg-warning/15 text-warning", rail: "bg-warning/60" },
  signature: { chip: "bg-success/12 text-success", rail: "bg-success/60" },
};

/**
 * A section that leads: open, titled, full weight.
 *
 * The rail is a 3px bar down the left edge in the section's own colour — enough
 * to tell two cards apart in peripheral vision, far less than a border round
 * the whole card, which is the treatment that got rejected.
 */
export function Section({
  title,
  icon: Icon,
  tone,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl bg-card p-4 pl-5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] rounded-r-full",
          TONE[tone].rail,
        )}
      />
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            TONE[tone].chip,
          )}
        >
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
  tone,
  summary,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="relative overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] rounded-r-full",
          TONE[tone].rail,
        )}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 py-2.5 pr-4 pl-5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md",
            TONE[tone].chip,
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
          {summary}
        </span>
      </button>
      {open ? <div className="pt-1 pr-4 pb-4 pl-5">{children}</div> : null}
    </section>
  );
}

/* ---------------------------------------------------------------- contents */

export function WhereBody({ job }: { job: JobDetail }) {
  return (
    <div className="space-y-3 text-sm">
      {/*
        The address block reads as a place rather than as three more lines of
        prose: a faint map grid behind it, a pin marker, and the landmark given
        its own icon. §6.5.1 puts the landmark on its own line because that is
        how an Indian address is actually resolved on the ground — this makes
        that line look like the instruction it is.
      */}
      <div className="relative overflow-hidden rounded-lg bg-info/[0.06] p-3">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-info) 1px, transparent 1px), linear-gradient(90deg, var(--color-info) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage:
              "radial-gradient(120% 100% at 85% 0%, #000 10%, transparent 70%)",
            opacity: 0.12,
          }}
        />
        <div className="relative flex gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-info" />
          <div className="min-w-0">
            <p className="font-medium">{job.site.addressLine}</p>
            <p className="text-muted-foreground tabular-nums">
              {job.site.locality} {job.site.pincode}
            </p>
            {job.site.landmark ? (
              <p className="mt-1.5 flex items-start gap-1.5">
                <Navigation className="mt-0.5 size-3.5 shrink-0 text-info" />
                <span>
                  <span className="text-muted-foreground">Landmark · </span>
                  {job.site.landmark}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

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
                render={<a href={telHref(contact.phone) ?? undefined} />}
                nativeButton={false}
              >
                <Phone className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={`WhatsApp ${contact.name}`}
                render={
                  <a
                    href={whatsappHref(contact.phone) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
                nativeButton={false}
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
        <Unavailable label="Add asset" reason={NEEDS_BACKEND} />
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
  const next = nextStepFor(job.status);

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

  // Newest first: what just happened is what she is being asked about on the
  // phone. The rail therefore runs *up* from the present, and the dashed
  // continuation sits at the top rather than the bottom.
  const events = [...job.timeline].reverse();

  return (
    <ol className="relative text-sm">
      {/*
        What has not happened yet, drawn as a dashed stub above the newest
        event. This is the difference between a log and a position: the reader
        can see that the job is one step from being billable without counting
        the entries.
      */}
      {next ? (
        <li className="relative flex gap-3 pb-4">
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-0 left-[7px] border-l-2 border-dashed border-muted-foreground/35"
          />
          <span
            aria-hidden="true"
            className="relative z-10 mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/45 bg-card"
          />
          <span className="min-w-0 pb-0.5">
            <span className="block text-muted-foreground">{next}</span>
            <span className="text-xs text-muted-foreground/80">
              not yet — the next thing this job owes
            </span>
          </span>
        </li>
      ) : null}

      {events.map((event, index) => {
        const newest = index === 0;
        const last = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Solid, because everything below the marker has happened. */}
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute top-4 bottom-0 left-[7px] w-0.5 bg-primary/25"
              />
            ) : null}

            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 mt-0.5 size-4 shrink-0 rounded-full border-2 border-card",
                // The newest event is where the job actually *is*, so it gets a
                // ring — the "you are here" marker the rail exists to place.
                newest
                  ? "bg-primary ring-3 ring-primary/25"
                  : "bg-primary/35",
              )}
            />

            <span className="min-w-0">
              <span
                className={cn("block", newest && "font-medium")}
              >
                {event.label}
              </span>
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
        );
      })}
    </ol>
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
    /*
      Quantity first and in its own chip, because that is the column being
      scanned — "what came off the van, how much" — and a right-aligned number
      at the end of a ragged label is read last.
    */
    <ul className="space-y-1.5 text-sm">
      {job.parts.map((part) => (
        <li key={part.name} className="flex items-center gap-2.5">
          <span className="grid min-w-11 shrink-0 place-items-center rounded-md bg-brand-brown/12 px-1.5 py-0.5 text-xs font-semibold text-brand-brown tabular-nums">
            {part.qty} {part.unit}
          </span>
          <span className="min-w-0 truncate">{part.name}</span>
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
      <div className="space-y-2">
        {/*
          An empty signature slot, drawn as one. The words alone made "not
          signed" look the same as every other muted sentence on the screen;
          the dashed box is the shape of the thing that is missing.
        */}
        <div className="grid h-16 place-items-center rounded-lg border-2 border-dashed border-muted-foreground/25">
          <PenLine className="size-5 text-muted-foreground/40" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">
          {job.status === "WORK_DONE"
            ? "Work is finished — waiting on the customer to sign."
            : job.status === "PARTS_AWAITED"
              ? "Held for parts, so there is nothing to sign yet."
              : "Not signed off yet — the work is still in progress."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3 rounded-lg bg-success/[0.08] p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/15 text-success">
          <CircleCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">{job.signOff.signerName}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {job.signOff.at} · rated {job.signOff.rating} of 5
          </p>
        </div>
      </div>
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
