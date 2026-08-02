"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Flag,
  MapPin,
  MessageCircle,
  Phone,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import { loading, type Query } from "@/lib/data/result";
import {
  getJobDetail,
  primaryActionFor,
  type JobDetail,
} from "@/lib/data/job-detail";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
import { can } from "@/lib/roles";

/**
 * Job detail — PRD §6.5. **The one decision:** *what does this job need from me
 * right now?*
 *
 * The above-the-fold order is §6.5.1's, and each position is argued there:
 * status **with elapsed duration** first (it answers the question she is about
 * to be asked on the phone), then customer/service/contract position (whether
 * the visit is contractually owed changes whether she may bump it), then value
 * (role-gated), then the action bar, then WHERE, then ASSET (because "is this
 * still under warranty?" changes what she is allowed to charge).
 *
 * **Exactly one primary action, from `primaryActionFor`** — same colour, same
 * position, top-right of the action bar, so muscle memory works (§6.5.3).
 * Everything else on the bar is secondary and **nothing is in a kebab**.
 *
 * ⚠️ **Scope note.** §6.5 also specifies this as a **640px right drawer** over a
 * dimmed board, with the URL updating so the job is linkable and shareable on
 * WhatsApp. This is the full page at its own URL — the shareable half. The
 * drawer needs a parallel + intercepting route restructure of the board layout
 * (and Next 16 fails the build without an explicit `default.tsx` per slot), so
 * it is deferred as a presentation change over content that is already correct.
 * Recorded in EXPAND_LOG rather than quietly dropped.
 */
export default function JobDetailPage({
  params,
}: {
  // Next 16: params is a Promise and must be unwrapped (async request APIs).
  params: Promise<{ jobNumber: string }>;
}) {
  const { jobNumber } = use(params);
  const [query, setQuery] = useState<Query<JobDetail>>(loading());
  const [hideAmounts, setHideAmounts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJobDetail(decodeURIComponent(jobNumber)).then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, [jobNumber]);

  const today = new Date();
  const showValue = can(CURRENT_USER.role, "price:view_selling");

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
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
      {/*
        Fills the available width. A centred `max-w-4xl` left ~430px of empty
        gutter on each side of a wide monitor, which reads as a broken layout on
        a data-dense screen — the content should use the space the sidebar
        leaves it.
      */}
      <div className="p-4 md:p-6">
        <QueryBoundary query={query} label="this job" loadingRows={6}>
          {(job) => {
            const primary = primaryActionFor(job.status);
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

              {/* ---- 1. Job number + status WITH elapsed duration (§6.5.1) --- */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="select-all text-sm text-muted-foreground tnum-id">
                  {job.jobNumber}
                </span>
                <StatusBadge status={job.status} />
                {job.statusSince ? (
                  // "A bare 'On site' does not" answer the question she is about
                  // to be asked on the phone. The duration is the point.
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

              {/* ---- 2. Customer, service, contract visit position ---------- */}
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
              </p>

              {/* ---- 3. Value, role-gated (§6.5.1, FR-1302) ----------------- */}
              {showValue && job.valuePaise !== null ? (
                <p className="mt-1 text-xl font-semibold">
                  <MoneyText
                    amount={asPaise(job.valuePaise)}
                    hidden={hideAmounts}
                  />
                </p>
              ) : null}

              {/* ---- 4. Action bar — all labelled, none in a kebab ---------- */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-y py-3">
                <Button variant="outline" size="sm">
                  <Phone className="size-4" />
                  Call site
                </Button>
                <Button variant="outline" size="sm">
                  Reassign
                </Button>
                <Button variant="outline" size="sm">
                  Reschedule
                </Button>
                {/* Exactly one primary, always top-right (§6.5.3). */}
                {primary ? (
                  <Button size="sm" className="ml-auto">
                    {primary.label}
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {/* ---- 5. WHERE ------------------------------------------- */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Where</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>{job.site.addressLine}</p>
                    {job.site.landmark ? (
                      // On its own line — a landmark is how an Indian address is
                      // actually resolved (§6.5.1).
                      <p className="font-medium">
                        Landmark: {job.site.landmark}
                      </p>
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
                      <p className="rounded-md bg-muted p-2 text-muted-foreground">
                        Access: {job.site.accessNotes}
                      </p>
                    ) : null}

                    <Separator />

                    <ul className="space-y-2">
                      {job.site.contacts.map((contact) => (
                        <li
                          key={contact.phone}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate">
                              {contact.name}{" "}
                              {/* Every number carries its role label (§6.5.1). */}
                              <span className="text-muted-foreground">
                                ({contact.role})
                              </span>
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {contact.phone}
                            </span>
                          </span>
                          <span className="flex shrink-0 gap-1">
                            <Button variant="outline" size="icon-sm" aria-label={`Call ${contact.name}`}>
                              <Phone className="size-3.5" />
                            </Button>
                            <Button variant="outline" size="icon-sm" aria-label={`WhatsApp ${contact.name}`}>
                              <MessageCircle className="size-3.5" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* ---- 6. ASSET ------------------------------------------- */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Asset</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {job.asset ? (
                      <>
                        <p className="font-medium">{job.asset.description}</p>
                        <p className="text-muted-foreground tnum-id">
                          {job.asset.serial ? `SL# ${job.asset.serial}` : null}
                          {job.asset.warrantyTo
                            ? ` · Warranty to ${job.asset.warrantyTo}`
                            : null}
                        </p>

                        {job.asset.repeatFailure ? (
                          <p className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/10 p-2 font-medium text-destructive">
                            <TriangleAlert className="size-4 shrink-0" />
                            Repeat failure: {job.asset.repeatFailure}
                          </p>
                        ) : null}

                        <Separator />
                        <p className="text-xs font-medium text-muted-foreground">
                          Last 3 services
                        </p>
                        <ul className="space-y-1 text-muted-foreground">
                          {job.asset.lastServices.map((s) => (
                            <li key={s.date} className="truncate">
                              <span className="tabular-nums">{s.date}</span> ·{" "}
                              {s.technician} · {s.summary}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-muted-foreground">
                          No assets registered at this site.
                        </p>
                        <Button variant="outline" size="sm">
                          Add asset
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ---- Below the fold: TIMELINE --------------------------- */}
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 text-sm">
                    {job.timeline.map((event) => (
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
                              // §4.2 rule 3 records whether an event originated
                              // offline; §9.2 makes `occurred_at` authoritative.
                              // A technician who finished at 4pm in a basement
                              // did the job at 4pm.
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
                </CardContent>
              </Card>

              {/* ---- Below the fold: PARTS + SIGN-OFF ------------------- */}
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Parts consumed</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {job.parts.length === 0 ? (
                      <p className="text-muted-foreground">
                        No parts recorded on this job.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {job.parts.map((part) => (
                          <li key={part.name} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">{part.name}</span>
                            <span className="shrink-0 tabular-nums">
                              {part.qty} {part.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sign-off</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {job.signOff ? (
                      <>
                        <p>
                          Signed off at{" "}
                          <span className="tabular-nums">{job.signOff.at}</span>{" "}
                          by {job.signOff.signerName}
                        </p>
                        <p className="text-muted-foreground tabular-nums">
                          Rated {job.signOff.rating} of 5
                        </p>
                        {!job.signOff.signatureUploaded ? (
                          // §6.5.2: this happens many times a day and "must read
                          // as normal, not as an error" — so it is muted text,
                          // not an alert.
                          <p className="rounded-md bg-muted p-2 text-muted-foreground">
                            Signature image still uploading from the
                            technician&apos;s phone.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Not signed off yet — the technician hasn&apos;t completed
                        the work.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
