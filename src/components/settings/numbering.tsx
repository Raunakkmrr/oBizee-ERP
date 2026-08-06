"use client";

import { CircleCheck, Hash, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Unavailable } from "@/components/shared/unavailable";
import {
  SERIES_NEEDS_BACKEND,
  financialYear,
  gapsIn,
  peek,
  sequenceOf,
  seriesKey,
  type DocType,
} from "@/lib/data/series";
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { useStoreState } from "@/lib/data/use-store";

/**
 * Document numbering — FR-811 made checkable.
 *
 * A gapless series is not something software should assert. Section 31 requires
 * a consecutive series, and a missing number is a document the department
 * presumes was issued and suppressed. So this screen does not print "gapless"
 * — it reads the numbers off the documents that exist and names anything
 * missing between the lowest and the counter.
 *
 * Stated per branch and per financial year because that is the key the law
 * uses, and the reason one flat counter was wrong: it never reset on 1 April
 * and could not tell two branches apart.
 */
const LABELS: Record<DocType, string> = {
  job: "Job numbers",
  invoice: "Tax invoices",
  receipt_voucher: "Receipt vouchers",
};

const NOTES: Record<DocType, string> = {
  job: "Spoken on the phone, so month-shaped rather than financial-year shaped",
  invoice: "Section 31 — consecutive, per branch, per financial year",
  receipt_voucher: "Section 31(3)(d) — its own series, never the invoice series",
};

/**
 * Whether a gap check on this series would mean anything.
 *
 * It only means something over a **complete** set of documents. The board holds
 * a working window — today and the recent past — not all 440 jobs of the year,
 * so absent numbers there are jobs that exist elsewhere, not holes. Printing
 * "Missing 399, 400, 401" off a partial dataset is a false alarm, and a check
 * that cries wolf on a fresh install is one nobody reads on the day it matters.
 *
 * Invoices and receipt vouchers are held in full, so their answer is real.
 */
const CHECKABLE: Record<DocType, boolean> = {
  job: false,
  invoice: true,
  receipt_voucher: true,
};

export function Numbering() {
  const state = useStoreState();
  const branch = SEED_TENANT.branches[0];
  const today = new Date();
  const fy = financialYear(today);

  /* The numbers on documents that exist — never what the counter believes. */
  const issued: Record<DocType, number[]> = {
    job: state.board.jobs
      .map((job) => sequenceOf(job.jobNumber))
      .filter((n): n is number => n !== null),
    invoice: state.invoices
      .map((invoice) => sequenceOf(invoice.number))
      .filter((n): n is number => n !== null),
    receipt_voucher: state.advances
      .map((advance) => sequenceOf(advance.voucherNumber))
      .filter((n): n is number => n !== null),
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Hash className="size-4 text-primary-text" />
          Document numbering
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {branch.name} &middot; financial year {fy.label}. Each series is its
          own counter and restarts at 1 on 1 April.
        </p>

        <div className="mt-4 grid gap-2">
          {(Object.keys(LABELS) as DocType[]).map((docType) => {
            const counter = state.series[seriesKey(branch.id, docType, today)] ?? 0;
            const present = issued[docType].filter((n) => n <= counter);
            const from = present.length > 0 ? Math.min(...present) : counter + 1;
            const gaps = gapsIn(present, from, counter);

            return (
              <div
                key={docType}
                // `min-w-0`: grid item, whose min-width is `auto`.
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted-bg p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{LABELS[docType]}</p>
                  <p className="text-xs text-muted-foreground">{NOTES[docType]}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tnum-id">
                    {peek(state.series, branch, docType, today)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    next &middot; {counter} issued this year
                  </p>
                </div>

                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
                    !CHECKABLE[docType]
                      ? "bg-muted text-muted-foreground"
                      : gaps.length === 0
                        ? "bg-success-bg text-success"
                        : "bg-destructive-bg text-destructive",
                  )}
                >
                  {!CHECKABLE[docType] ? (
                    "Not a statutory series"
                  ) : gaps.length === 0 ? (
                    <>
                      <CircleCheck aria-hidden="true" className="size-3.5" />
                      No gaps
                    </>
                  ) : (
                    <>
                      <TriangleAlert aria-hidden="true" className="size-3.5" />
                      Missing {gaps.slice(0, 3).join(", ")}
                      {gaps.length > 3 ? ` +${gaps.length - 3}` : ""}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* The honest limit, stated where somebody would otherwise trust it. */}
      <Unavailable
        label="Issued in this browser"
        reason={SERIES_NEEDS_BACKEND}
      />
    </div>
  );
}
