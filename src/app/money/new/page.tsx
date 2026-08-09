"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase, FileClock, PencilLine } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money-text";
import { ROW_TR } from "@/components/shared/controls";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BILLING_LABEL } from "@/lib/data/contracts";
import {
  alreadyBilled,
  billableContractPoints,
  billableJobs,
  groupByContract,
  nothingToBillReason,
} from "@/lib/data/billable";
import { useEffect, useState } from "react";
import { getBoard, type JobRow } from "@/lib/data/board";
import { getContracts, type Contract } from "@/lib/data/contracts";
import { getInvoiceRegister, type SettlementTarget } from "@/lib/data/advances";
import { createInvoice } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * New invoice — the chooser.
 *
 * **What this replaces.** The "New invoice" button used to open the *review*
 * surface, which renders the most recent invoice. So asking for a new invoice
 * showed you an old one, complete with another customer's details. The button
 * lied about where it went.
 *
 * **The one decision:** *what am I billing?* — and the ordering is the opinion.
 * A contract instalment that has come due is money already agreed and most
 * often missed, so it is first. A completed job is next. Typing one from
 * scratch is last, because an invoice that traces to no work is how a register
 * stops reconciling with the job board.
 *
 * Nothing here is a dead end: when there is nothing to bill, the screen says
 * which kind of nothing — no work done, or all of it already billed.
 */
export default function NewInvoicePage() {
  const router = useRouter();
  /*
    The number is issued by the database, not chosen here — GST §31 wants one
    consecutive series, and a browser counter cannot give it one across two
    laptops. So this awaits the server and navigates only on success: an
    invoice screen showing a number that was never persisted is worse than a
    moment of latency.
  */
  const raise = useMutation(createInvoice);

  /*
    Three reads, from the register.

    What is billable is the intersection of what has been done and what has
    already been billed — and getting either from a browser copy means offering
    to raise an invoice a colleague raised an hour ago.
  */
  const [boardJobs, setBoardJobs] = useState<JobRow[]>([]);
  const [invoices, setInvoices] = useState<SettlementTarget[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getBoard(), getInvoiceRegister(), getContracts()]).then(
      ([board, register, amcs]) => {
        if (cancelled) return;
        if (board.status === "ready") setBoardJobs([...board.data.jobs]);
        if (register.status === "ready") setInvoices([...register.data.invoices]);
        if (amcs.status === "ready") setContracts([...amcs.data.contracts]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const jobs = billableJobs(boardJobs, invoices);
  // Grouped, so a contract eight months unbilled is one row and not eight.
  const points = groupByContract(billableContractPoints(contracts, invoices));
  const billed = alreadyBilled(boardJobs, invoices);
  const today = new Date();

  async function raiseFromJob(jobId: string) {
    const job = boardJobs.find((candidate) => candidate.id === jobId);
    const result = await raise.run({
      jobId,
      lines: [
        {
          description: `${job?.serviceType ?? "Service"} — ${job?.jobNumber ?? ""}`.trim(),
          // SAC 9987: maintenance, repair and installation services.
          code: "9987",
          kind: "service",
          qty: 1,
          ratePaise: job?.valuePaise ?? 4_500_00,
          ratePercent: 18,
        },
      ],
    });
    // The review screen is told which document to show, not left to guess.
    if (result?.ok) router.push(`/money/invoice?id=${result.data.id}`);
  }

  async function raiseFromContract(contractId: string, point: number, amountPaise: number) {
    const result = await raise.run({
      contractId,
      contractPoint: point,
      lines: [
        {
          description: `AMC instalment ${point}`,
          code: "9987",
          kind: "service",
          qty: 1,
          ratePaise: amountPaise,
          ratePercent: 18,
        },
      ],
    });
    // The review screen is told which document to show, not left to guess.
    if (result?.ok) router.push(`/money/invoice?id=${result.data.id}`);
  }

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        {raise.error ? (
          <div className="mb-4">
            <ErrorState error={raise.error} onRetry={raise.reset} />
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/money" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to money
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Money", href: "/money" }]}
          className="mb-4"
          title="New invoice"
          description="What are you billing? Almost always work that already happened."
        />

        <div className="grid max-w-4xl gap-4">
          <Panel
            title="Contract instalments due"
            icon={FileClock}
            count={points.length}
            caption={
              points.length > 0
                ? "Agreed money, on a schedule — the commonest thing to miss"
                : undefined
            }
            flush
          >
            {points.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No contract instalment has come due.
              </p>
            ) : (
              points.map(({ oldest: row, backlog }) => (
                <div
                  key={row.contract.id}
                  className={cn(
                    "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-3 last:border-b-0",
                    ROW_TR,
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.contract.customer}{" "}
                      <span className="text-muted-foreground tnum-id">
                        {row.contract.reference}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {BILLING_LABEL[row.contract.billing]} · invoice{" "}
                      {row.point.number} of {row.point.of} ·{" "}
                      {row.daysLate >= 0
                        ? `${row.daysLate} day${row.daysLate === 1 ? "" : "s"} late`
                        : `due in ${Math.abs(row.daysLate)} days`}
                      {backlog > 0 ? (
                        <span className="text-brand-brown">
                          {" "}
                          · {backlog} more unbilled
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <MoneyText
                    amount={asPaise(row.point.amountPaise)}
                    className="shrink-0 text-sm font-medium"
                  />
                  <Button
                    size="sm"
                    variant={row.daysLate >= 0 ? "default" : "outline"}
                    className="shrink-0"
                    disabled={raise.pending}
                      onClick={() =>
                        void raiseFromContract(
                        row.contract.id,
                        row.point.number,
                        row.point.amountPaise,
                      )
                    }
                  >
                    Bill this
                  </Button>
                </div>
              ))
            )}
          </Panel>

          <Panel
            title="Completed jobs, not yet billed"
            icon={Briefcase}
            count={jobs.length}
            caption={
              jobs.length > 0 ? "Work finished — the money has been earned" : undefined
            }
            flush
          >
            {jobs.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {/* Which kind of nothing, never a bare empty state. */}
                {nothingToBillReason(0, billed)}
              </p>
            ) : (
              jobs.map(({ job, reason }) => (
                <div
                  key={job.id}
                  className={cn(
                    "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-4 py-3 last:border-b-0",
                    ROW_TR,
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {job.customer}{" "}
                      <span className="text-muted-foreground tnum-id">
                        {job.jobNumber}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.serviceType} · {job.locality} · {reason}
                    </p>
                  </div>
                  {job.valuePaise !== null ? (
                    <MoneyText
                      amount={asPaise(job.valuePaise)}
                      className="shrink-0 text-sm font-medium"
                    />
                  ) : (
                    // Never a fabricated zero — §6.3.
                    <span className="shrink-0 text-xs text-muted-foreground">
                      not valued yet
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void raiseFromJob(job.id)}
                    disabled={raise.pending}
                  >
                    Bill this
                  </Button>
                </div>
              ))
            )}
          </Panel>

          <Panel
            title="Something else"
            icon={PencilLine}
            caption="A counter sale or a one-off supply, traced to no job"
            flush
          >
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Type the lines yourself. Use this last — an invoice that traces
                to no work is one the job board cannot explain.
              </p>
              <Button
                variant="outline"
                render={<Link href="/money/new/adhoc" />}
                nativeButton={false}
              >
                Write one by hand
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
