"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleCheck, Clock, Flag, MapPin, Package, Phone, ReceiptIndianRupee } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { Button } from "@/components/ui/button";
import { AssetBody, CollapsedSection, DecisionBand, PartsBody, Section, SignOffBody, TimelineBody, WhereBody, type Tone } from "@/components/job/sections";
import { useDispatch, useStoreState } from "@/lib/data/use-store";
import { getState } from "@/lib/data/store";
import { StatusBadge } from "@/components/shared/status-badge";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import { loading, type Query } from "@/lib/data/result";
import { canBillNow, getJobDetail, primaryActionFor, stageFor, type JobDetail } from "@/lib/data/job-detail";
import { Unavailable } from "@/components/shared/unavailable";
import { Chip } from "@/components/shared/controls";
import { PersonPicker } from "@/components/people/person-picker";
import { telHref, whatsappHref } from "@/lib/contact";
import { CURRENT_USER, SEED_TENANT, SEED_USERS } from "@/lib/data/fixtures/tenant";
import { can } from "@/lib/roles";

/**
 * Job detail — PRD §6.5. **The one decision:** *what does this job need from me
 * right now?*
 *
 * **The redesign, and what was wrong.** The screen used to be static across the
 * job's entire life: `Where` and `Asset` held the top row whether the
 * technician was still travelling or had finished two hours ago. But an address
 * is what matters *before* a visit and dead weight *after* it, and parts and
 * sign-off are exactly the reverse. Worst of it, on a finished job the only
 * question is "can I bill this?" — and the screen answered it nowhere:
 * `Bill this job` was a tertiary outline button, fourth in a row of five,
 * while the filled primary was `Send sign-off link`.
 *
 * So `stageFor` decides the question, the evidence, and which sections earn the
 * top of the screen; everything else collapses with its summary in the header.
 * §6.5.1's ordering is preserved *within* a stage — status with its elapsed
 * duration, then customer and contract position, then value — and `Where`
 * still leads before the visit, which is the stage §6.5.1 was written about.
 *
 * **Exactly one primary action, from `primaryActionFor`** — same colour, same
 * position, so muscle memory works (§6.5.3). Nothing is in a kebab.
 *
 * ⚠️ **Scope note.** §6.5 also specifies this as a **640px right drawer** over a
 * dimmed board, with the URL updating so the job is linkable and shareable on
 * WhatsApp. This is the full page at its own URL — the shareable half. The
 * drawer needs a parallel + intercepting route restructure of the board layout
 * (and Next 16 fails the build without an explicit `default.tsx` per slot), so
 * it is deferred as a presentation change over content that is already correct.
 * Recorded in EXPAND_LOG rather than quietly dropped.
 */
/** The tenant's own windows (§11-Q15), as the board renders them. */
const SLOTS = ["9-1", "1-5", "5-8"] as const;

export default function JobDetailPage({
  params,
}: {
  // Next 16: params is a Promise and must be unwrapped (async request APIs).
  params: Promise<{ jobNumber: string }>;
}) {
  const { jobNumber } = use(params);
  const dispatch = useDispatch();
  const router = useRouter();
  const storeState = useStoreState();
  const [query, setQuery] = useState<Query<JobDetail>>(loading());
  const [hideAmounts, setHideAmounts] = useState(false);
  /** Which inline picker is open — assignment, slot, or none. */
  const [picker, setPicker] = useState<"technician" | "slot" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJobDetail(decodeURIComponent(jobNumber)).then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, [jobNumber, storeState]);

  const today = new Date();
  const showValue = can(CURRENT_USER.role, "price:view_selling");
  const policy = {
    allowBillingWithoutSignoff: SEED_TENANT.toggles.allowBillingWithoutSignoff,
  };

  function move(jobNumber: string, action: (id: string) => void) {
    const match = getState().board.jobs.find(
      (candidate) => candidate.jobNumber === jobNumber,
    );
    if (match) action(match.id);
    setPicker(null);
  }

  function bill(job: JobDetail) {
    const match = getState().board.jobs.find(
      (candidate) => candidate.jobNumber === job.jobNumber,
    );
    if (!match) return;
    dispatch({ type: "CREATE_INVOICE_FROM_JOB", jobId: match.id });
    router.push("/money/invoice");
  }

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
      hideAmounts={hideAmounts}
      onToggleAmounts={() => setHideAmounts((v) => !v)}
    >
      {/*
        The container wraps the boundary, not the other way round, so a partial
        notice or an error aligns with the content it refers to instead of
        running full-bleed past it.
      */}
      <div className="p-4 md:p-6">
        <QueryBoundary query={query} label="this job" loadingRows={6}>
          {(job) => {
            const stage = stageFor(job, policy);
            const primary = primaryActionFor(job.status);
            const billable = canBillNow(job, policy);
            const leads = new Set(stage.lead);
            // The first contact on the site record is the one to ring.
            const siteCall = telHref(job.site.contacts[0]?.phone);
            const techCall = telHref(
              SEED_USERS.find((u) => u.id === job.technician?.id)?.phone,
            );
            // The sign-off request goes to the person at site, not the office.
            const signOffRequest = whatsappHref(
              job.site.contacts[0]?.phone,
              `Namaste, the work on ${job.jobNumber} at ${job.site.locality} is complete. Kindly confirm sign-off so we can raise the invoice. Thank you.`,
            );

            /** Open where the stage says so, collapsed with a summary otherwise. */
            const section = (
              key: "where" | "asset" | "timeline" | "parts" | "signoff",
              title: string,
              icon: typeof MapPin,
              tone: Tone,
              summary: string,
              body: React.ReactNode,
            ) =>
              leads.has(key) ? (
                <Section key={key} title={title} icon={icon} tone={tone}>
                  {body}
                </Section>
              ) : (
                <CollapsedSection
                  key={key}
                  title={title}
                  icon={icon}
                  tone={tone}
                  summary={summary}
                >
                  {body}
                </CollapsedSection>
              );

            const sections = {
              where: section(
                "where",
                "Where",
                MapPin,
                "place",
                [
                  job.site.locality || null,
                  job.site.contacts.length > 0
                    ? `${job.site.contacts.length} contacts`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "not recorded",
                <WhereBody job={job} />,
              ),
              asset: section(
                "asset",
                "Asset",
                Package,
                "machine",
                job.asset
                  ? [job.asset.description, job.asset.repeatFailure && "repeat failure"]
                      .filter(Boolean)
                      .join(" · ")
                  : "none registered",
                <AssetBody job={job} />,
              ),
              timeline: section(
                "timeline",
                "What happened",
                Clock,
                "history",
                job.timeline.length > 0
                  ? `${job.timeline.length} events · last ${job.timeline.at(-1)?.at}`
                  : "nothing recorded yet",
                <TimelineBody job={job} />,
              ),
              parts: section(
                "parts",
                "Parts used",
                Package,
                "materials",
                job.parts.length > 0
                  ? `${job.parts.length} recorded`
                  : "none recorded",
                <PartsBody job={job} />,
              ),
              signoff: section(
                "signoff",
                "Sign-off",
                CircleCheck,
                "signature",
                job.signOff
                  ? `signed by ${job.signOff.signerName}`
                  : "not signed yet",
                <SignOffBody job={job} />,
              ),
            } as const;

            const order = [
              ...stage.lead,
              ...(["where", "asset", "timeline", "parts", "signoff"] as const).filter(
                (key) => !leads.has(key),
              ),
            ];

            return (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-3 -ml-2"
                  render={<Link href="/today" />}
                  nativeButton={false}
                >
                  <ArrowLeft className="size-4" />
                  Back to today
                </Button>

                {/* ---- Identity: number, status WITH duration (§6.5.1) ---- */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="select-all text-sm text-muted-foreground tnum-id">
                    {job.jobNumber}
                  </span>
                  <StatusBadge status={job.status} />
                  {job.statusSince ? (
                    // "A bare 'On site' does not" answer the question she is
                    // about to be asked on the phone. The duration is the point.
                    <span className="text-sm text-muted-foreground tabular-nums">
                      since {job.statusSince}
                    </span>
                  ) : null}
                  {job.priority !== "normal" ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-destructive">
                      <Flag className="size-3.5" aria-hidden="true" />
                      {job.priority === "breakdown" ? "Breakdown" : "Urgent"}
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {job.customer}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {job.serviceType}
                  {job.visit ? (
                    <span className="tabular-nums">
                      {" "}
                      · Visit {job.visit.n} of {job.visit.of}
                    </span>
                  ) : null}
                  {/* Who is on it — the second thing anyone asks, and the old
                      screen never said it anywhere. */}
                  {job.technician ? ` · ${job.technician.name}` : null}
                </p>

                {showValue && job.valuePaise !== null ? (
                  <p className="mt-1 text-xl font-semibold">
                    <MoneyText
                      amount={asPaise(job.valuePaise)}
                      hidden={hideAmounts}
                    />
                  </p>
                ) : null}

                {/* ---- The decision, and the actions that resolve it ------ */}
                <div className="mt-4">
                  <DecisionBand stage={stage}>
                    {/*
                      Exactly one primary (§6.5.3) — and on a signed-off job the
                      primary *is* the billing action. Rendering both the
                      table's "Create invoice" and a separate "Bill this job"
                      put two buttons for one outcome side by side, which is the
                      ambiguity §6.13.2 exists to prevent. So the primary
                      carries the dispatch when it is the invoice action, and
                      the outline button appears only when billing is possible
                      *without* being the primary — a WORK_DONE job under a
                      tenant that permits billing before sign-off.
                    */}
                    {primary ? (
                      /*
                        Every branch of §6.5.3's table does something. Wiring
                        only `#invoice` left `Schedule revisit`, `Assign
                        technician` and `Send sign-off link` looking identical
                        to a working primary and doing nothing — which is how
                        the whole dead-button problem started.
                      */
                      primary.href === "#signoff-link" ||
                      primary.href === "#reminder" ? (
                        <Button
                          size="sm"
                          render={
                            <a
                              href={signOffRequest ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                          nativeButton={false}
                          disabled={!signOffRequest}
                        >
                          {primary.label}
                        </Button>
                      ) : primary.href === "#call-technician" ? (
                        <Button
                          size="sm"
                          render={<a href={techCall ?? undefined} />}
                          nativeButton={false}
                          disabled={!techCall}
                        >
                          {primary.label}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (primary.href === "#invoice") bill(job);
                            else if (primary.href === "#assign")
                              setPicker("technician");
                            // schedule, reschedule and revisit are all "put it
                            // in a different slot".
                            else setPicker("slot");
                          }}
                        >
                          {primary.label}
                        </Button>
                      )
                    ) : null}
                    {billable && primary?.href !== "#invoice" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bill(job)}
                      >
                        <ReceiptIndianRupee className="size-4" />
                        Bill this job
                      </Button>
                    ) : null}
                    {/*
                      Real destinations, all three. These were decorative until
                      an audit found 39 of the product's 91 buttons had no
                      handler and no link — identical in appearance to the ones
                      that worked, and silent when pressed.
                    */}
                    {siteCall ? (
                      <Button
                        variant="outline"
                        size="sm"
                        render={<a href={siteCall} />}
                        nativeButton={false}
                      >
                        <Phone className="size-4" />
                        Call site
                      </Button>
                    ) : (
                      <Unavailable
                        label="Call site"
                        icon={Phone}
                        reason="No contact number on record for this site"
                      />
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPicker("technician")}
                    >
                      {job.technician ? "Reassign" : "Assign"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPicker("slot")}
                    >
                      Reschedule
                    </Button>
                    {picker === "technician" ? (
                      <PersonPicker
                        people={getState().people}
                        job={{
                          serviceType: job.serviceType,
                          locality: job.site.locality,
                          // Without this the apprentice rule is inert: the
                          // model knows not to send one alone to a breakdown,
                          // and the picker never told it which kind of job
                          // this was.
                          priority: job.priority,
                        }}
                        loadFor={(id) =>
                          getState().board.jobs.filter(
                            (candidate) => candidate.technician?.id === id,
                          ).length
                        }
                        selectedId={job.technician?.id ?? null}
                        onCancel={() => setPicker(null)}
                        onPick={(person) =>
                          move(job.jobNumber, (id) =>
                            dispatch({
                              type: "ASSIGN_JOB",
                              jobId: id,
                              technicianId: person.id,
                              technicianName: person.name,
                            }),
                          )
                        }
                      />
                    ) : picker === "slot" ? (
                      <div className="mt-1 flex w-full flex-wrap items-center gap-1.5 rounded-xl bg-muted p-2">
                        <span className="mr-1 text-xs font-medium text-muted-foreground">
                          Move to
                        </span>
                        {SLOTS.map((slot) => (
                          <Chip
                            key={slot}
                            label={slot}
                            selected={false}
                            onClick={() =>
                              move(job.jobNumber, (id) =>
                                dispatch({
                                  type: "RESCHEDULE_JOB",
                                  jobId: id,
                                  slot,
                                }),
                              )
                            }
                          />
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setPicker(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </DecisionBand>
                </div>

                {/*
                  Leading sections first and side by side; the collapsed ones
                  fall underneath as single rows, so the fold is spent on what
                  this stage actually needs.
                */}
                {/*
                  `items-start`, so a card sizes to its own content. Without it
                  an empty Parts card stretched to match a long timeline beside
                  it — a tall white rectangle holding one sentence, which reads
                  as something failing to load.
                */}
                <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
                  {order
                    .filter((key) => leads.has(key))
                    .map((key) => sections[key])}
                </div>
                <div className="mt-3 grid gap-2">
                  {order
                    .filter((key) => !leads.has(key))
                    .map((key) => sections[key])}
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
