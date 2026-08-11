"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { Button } from "@/components/ui/button";
import { getJobDetail, type JobDetail } from "@/lib/data/job-detail";
import { getFirmProfile, type FirmProfile } from "@/lib/data/series";
import { COVERAGE_LABEL } from "@/lib/data/contracts";
import { dayWords } from "@/lib/data/attention";
import { loading, type Query } from "@/lib/data/result";

/**
 * The job card — a sheet of paper a technician carries to the door.
 *
 * **Why paper at all, in 2026.** A technician on a scooter in Kalkaji has a
 * phone with a battery and a signal, and both of those run out. The card is the
 * fallback that does not: it holds the address, the landmark, how to get in,
 * who to ring, what the work is, and blank space for what he did — so a visit
 * survives a dead phone, and so the customer has something to sign.
 *
 * **Why print rather than a generated PDF.** The browser's own print dialog
 * gives paper *or* a PDF from the same button, with no dependency, no endpoint
 * and no layout engine to keep alive. When something needs to attach this to a
 * WhatsApp message a real file becomes necessary; nothing does yet, and
 * building for that day would have cost a PDF library today.
 *
 * **What is deliberately blank.** Parts used, work done, and the signature are
 * ruled empty boxes. This document goes *out* full of what the office knows and
 * comes *back* carrying what only the site can tell you — printing today's
 * empty parts list as "none recorded" would put a claim on paper that the visit
 * has not had a chance to make yet.
 *
 * The screen chrome is `print:hidden`; the sheet itself carries no shell, so
 * what appears on paper is what appears here minus the two buttons.
 */

/** Ruled space for something only the site can fill in. */
function WriteIn({ label, lines }: { label: string; lines: number }) {
  return (
    <section className="mt-4 break-inside-avoid">
      <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
        {label}
      </p>
      <div className="mt-1">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-7 border-b border-dashed border-neutral-300" />
        ))}
      </div>
    </section>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

export default function JobCardPage({
  params,
}: {
  params: Promise<{ jobNumber: string }>;
}) {
  const { jobNumber } = use(params);
  const [query, setQuery] = useState<Query<JobDetail>>(loading());
  const [firm, setFirm] = useState<FirmProfile | null>(null);

  useEffect(() => {
    void getJobDetail(decodeURIComponent(jobNumber)).then(setQuery);
    /*
      The letterhead is allowed to fail.

      `settings:read` is an office permission, and a coordinator printing for a
      technician has it — but if it is ever refused, a card with no firm name is
      still a usable card, and refusing to print would be the worse answer.
    */
    void getFirmProfile().then((result) => {
      if (result.status === "ready") setFirm(result.data);
    });
  }, [jobNumber]);

  return (
    <main className="mx-auto max-w-[820px] bg-white p-6 text-neutral-900 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" render={<Link href={`/jobs/${jobNumber}`} />} nativeButton={false}>
          <ArrowLeft className="size-4" />
          Back to the job
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print or save as PDF
        </Button>
      </div>

      <QueryBoundary query={query} label="job card" loadingRows={6}>
        {(job) => (
          <article className="border border-neutral-300 p-6 print:border-0 print:p-4">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-300 pb-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold">
                  {firm?.businessName ?? "Job card"}
                </p>
                {firm?.branch ? (
                  <p className="text-xs text-neutral-500">
                    {firm.branch.name} · GSTIN {firm.branch.gstin}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                  Job card
                </p>
                <p className="font-mono text-lg font-semibold">{job.jobNumber}</p>
              </div>
            </header>

            {/* When and what — the two facts that decide whether the sheet is
                even the right one to be holding. */}
            <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-base font-semibold">
                {job.scheduledDate ? dayWords(job.scheduledDate) : "No date set"}
                {job.slot ? <span className="font-normal"> · {job.slot}</span> : null}
              </p>
              <p className="text-base">{job.serviceType}</p>
              {job.priority !== "normal" ? (
                <p className="border border-neutral-900 px-2 py-0.5 text-xs font-semibold uppercase">
                  {job.priority === "breakdown" ? "Breakdown" : "Urgent"}
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <section className="space-y-1">
                <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                  Customer
                </p>
                <p className="text-sm font-medium">{job.customer}</p>
                <p className="text-sm">{job.site.addressLine}</p>
                <p className="text-sm">
                  {job.site.locality} {job.site.pincode}
                </p>
                {/* §7.5 — its own line. This is how an Indian address is
                    actually resolved on the ground, and on paper it is the
                    line the technician reads first. */}
                {job.site.landmark ? (
                  <p className="text-sm">
                    <span className="text-neutral-500">Landmark: </span>
                    {job.site.landmark}
                  </p>
                ) : null}
                {job.site.accessNotes ? (
                  <p className="mt-1 border-l-2 border-neutral-400 pl-2 text-sm">
                    {job.site.accessNotes}
                  </p>
                ) : null}
              </section>

              <section className="space-y-1">
                <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                  Who to ring
                </p>
                {job.site.contacts.length === 0 ? (
                  // Not a blank. A card that silently omits this reads as though
                  // there was nobody worth printing.
                  <p className="text-sm">No contact on file for this site.</p>
                ) : (
                  job.site.contacts.map((contact) => (
                    <p key={`${contact.name}-${contact.phone}`} className="text-sm">
                      {contact.name}
                      <span className="text-neutral-500"> ({contact.role})</span>
                      <br />
                      <span className="font-mono">{contact.phone}</span>
                    </p>
                  ))
                )}

                <div className="pt-2">
                  <Line label="Technician">
                    {job.technician?.name ?? "Not assigned"}
                  </Line>
                  {job.visit ? (
                    <Line label="Visit">
                      {job.visit.n} of {job.visit.of}
                    </Line>
                  ) : null}
                  {job.contract ? (
                    /* Coverage decides whether a part consumed today is billable
                       (FR-504) — so it belongs on the sheet held by the person
                       consuming it, not only in the office. */
                    <Line label="Contract">
                      {job.contract.reference} · {COVERAGE_LABEL[job.contract.coverage]}
                    </Line>
                  ) : null}
                  {job.asset ? (
                    <Line label="Asset">
                      {job.asset.description}
                      {job.asset.serial ? ` · ${job.asset.serial}` : ""}
                    </Line>
                  ) : null}
                </div>
              </section>
            </div>

            <WriteIn label="Work done" lines={4} />
            <WriteIn label="Parts used" lines={3} />

            <section className="mt-6 flex flex-wrap justify-between gap-6 break-inside-avoid">
              <div className="min-w-[220px] flex-1">
                <div className="h-12 border-b border-neutral-400" />
                <p className="mt-1 text-xs text-neutral-500">
                  Customer signature &amp; name
                </p>
              </div>
              <div className="min-w-[160px] flex-1">
                <div className="h-12 border-b border-neutral-400" />
                <p className="mt-1 text-xs text-neutral-500">
                  Time in / time out
                </p>
              </div>
            </section>

            <p className="mt-4 border-t border-neutral-300 pt-2 text-[11px] text-neutral-500">
              Sign-off on paper is a record of the visit, not an invoice. The
              office raises the bill against {job.jobNumber}.
            </p>
          </article>
        )}
      </QueryBoundary>
    </main>
  );
}
