"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  Info,
  ListChecks,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { ColumnHeader, Panel } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import {
  BLOCKS_EXPORT,
  READINESS_ACTION,
  READINESS_LABEL,
  exportReadiness,
  formatPaiseDelta,
  getGstPeriod,
  reconcile,
  type GstPeriod,
} from "@/lib/data/gst";
import { CURRENT_USER, SEED_TENANT } from "@/lib/data/fixtures/tenant";

/**
 * GST workspace — §6.14, FR-814.
 *
 * **The one decision:** *can I file this period, and what is unresolved?*
 *
 * Not "here are your numbers" — the accountant already has numbers. What he has
 * never had is a machine willing to say **no, and here is exactly why**. So the
 * screen is ordered by that: period, then what is unresolved, then the totals,
 * then the working paper, then an export that refuses when it should.
 *
 * Two rules from §6.14 are load-bearing and visible:
 *
 * - **"A partial GST export is worse than none."** The export button is disabled
 *   with the blocking rows listed by name and count. Never "validation failed".
 * - **FR-814's footing line** proves the working paper agrees with the invoice
 *   register **to the paisa**, and says which side is short when it does not.
 */
export default function GstWorkspacePage() {
  const [query, setQuery] = useState<Query<GstPeriod>>(loading());

  useEffect(() => {
    let cancelled = false;
    getGstPeriod().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-4"
          breadcrumb={[
            { label: "Money" },
            { label: "Reports", href: "/reports" },
          ]}
          title="GST workspace"
          description="Whether this period can be filed, and what is unresolved."
        />

        <QueryBoundary query={query} label="the GST period" loadingRows={6}>
          {(period) => {
            const balance = reconcile(period);
            const readiness = exportReadiness(period);
            const blocking = period.readiness.filter(
              (row) => row.count > 0 && BLOCKS_EXPORT[row.kind],
            );
            const informational = period.readiness.filter(
              (row) => row.count > 0 && !BLOCKS_EXPORT[row.kind],
            );
            const clear = period.readiness.filter((row) => row.count === 0);

            return (
              <div className="space-y-4">
                {/* --------- Period + the verdict, above everything --------- */}
                <Card className="gap-0 py-0">
                  {/*
                    Stacked below `sm`. `flex-wrap` with a `shrink-0` button
                    pair beside a flexible text column collapsed the text to a
                    few characters per line at 390px — the period and the
                    verdict broke one word at a time down the left edge.
                  */}
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-center">
                    <span
                      className={cn(
                        "grid size-11 shrink-0 place-items-center rounded-xl",
                        readiness.kind === "ready"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {readiness.kind === "ready" ? (
                        <CircleCheck className="size-5" />
                      ) : (
                        <TriangleAlert className="size-5" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        GSTR-1 · {period.periodLabel} ·{" "}
                        <span className="tnum-id">
                          {SEED_TENANT.branches[0].gstin}
                        </span>
                      </p>
                      <p className="text-lg font-semibold">
                        {readiness.kind === "ready"
                          ? "Ready to file"
                          : `Not ready — ${readiness.reasons.length} thing${readiness.reasons.length === 1 ? "" : "s"} to resolve`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      {/*
                        §6.14: the export is blocked, not merely warned about.
                        A partial GST export produces a return that looks filed
                        and is wrong, and the taxpayer carries that.
                      */}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={readiness.kind !== "ready"}
                      >
                        <FileSpreadsheet className="size-3.5" />
                        Export XLSX
                      </Button>
                      <Button size="sm" disabled={readiness.kind !== "ready"}>
                        <Download className="size-3.5" />
                        Export JSON
                      </Button>
                    </div>
                  </div>

                  {readiness.kind === "blocked" ? (
                    // Every reason, by name and count. Never a generic message.
                    <div className="border-t bg-destructive/5 px-4 py-3">
                      <p className="text-xs font-medium text-destructive">
                        Export is blocked until these are resolved
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {readiness.reasons.map((reason) => (
                          <li
                            key={reason}
                            className="flex items-start gap-2 text-sm text-destructive"
                          >
                            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>

                <div className="grid gap-4 xl:grid-cols-5">
                  {/* --------------- The working paper --------------- */}
                  {/* `min-w-0`: a grid item defaults to `min-width: auto`, so
                      without it the 640px working paper forces the track wider
                      than the viewport and the scroller never engages — the
                      same trap that made the whole app scroll sideways once. */}
                  <div className="min-w-0 space-y-4 xl:col-span-3">
                    <Panel
                      title="GSTR-1 working paper"
                      icon={Scale}
                      caption="Table by table, footed against the invoice register"
                      flush
                    >
                      {/*
                        A GSTR-1 working paper has an irreducible column set —
                        table, coverage, documents, taxable, tax — and squeezing
                        it on a phone would put two figures on one line, which is
                        how a filing gets misread. So the table keeps its width
                        and scrolls **inside this panel**; the page body never
                        scrolls sideways (measured: 414px of body overflow at
                        390px before this).
                      */}
                      <div className="overflow-x-auto">
                      <div className="min-w-[640px]">
                      <ColumnHeader>
                        <span className="w-16 shrink-0">Table</span>
                        <span className="min-w-0 flex-1">What it covers</span>
                        <span className="w-16 shrink-0 text-right">Docs</span>
                        <span className="w-32 shrink-0 text-right">Taxable</span>
                        <span className="w-28 shrink-0 text-right">Tax</span>
                      </ColumnHeader>

                      {period.tables.map((table) => (
                        <div
                          key={table.code}
                          className={cn(
                            "flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0",
                            table.failed && "bg-destructive/5",
                          )}
                        >
                          <span className="w-16 shrink-0 font-medium tnum-id">
                            {table.code}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-muted-foreground">
                              {table.label}
                            </span>
                            {table.failed ? (
                              // §6.14's partial: inline, named, and it disables
                              // the export rather than being treated as zero.
                              <span className="text-xs text-destructive">
                                Could not be computed — this table is not zero,
                                it is unknown.
                              </span>
                            ) : null}
                          </span>
                          <span className="w-16 shrink-0 text-right tabular-nums">
                            {table.failed ? EM_DASH : table.documents}
                          </span>
                          <span className="w-32 shrink-0 text-right tabular-nums">
                            {table.failed ? (
                              <span className="text-muted-foreground">
                                {EM_DASH}
                              </span>
                            ) : (
                              <MoneyText amount={asPaise(table.taxablePaise)} />
                            )}
                          </span>
                          <span className="w-28 shrink-0 text-right tabular-nums">
                            {table.failed ? (
                              <span className="text-muted-foreground">
                                {EM_DASH}
                              </span>
                            ) : (
                              <MoneyText amount={asPaise(table.taxPaise)} />
                            )}
                          </span>
                        </div>
                      ))}

                      {/* ---------- FR-814's footing line ---------- */}
                      <div
                        className={cn(
                          "border-t-2 px-4 py-3",
                          balance.balanced
                            ? "border-t-success/40 bg-success/5"
                            : "border-t-destructive/40 bg-destructive/5",
                        )}
                      >
                        <div className="flex items-center gap-3 text-sm">
                          <span className="min-w-0 flex-1 font-medium">
                            Tables total
                          </span>
                          <span className="w-16 shrink-0" />
                          <span className="w-32 shrink-0 text-right font-semibold tabular-nums">
                            <MoneyText
                              amount={asPaise(balance.tableTaxablePaise)}
                            />
                          </span>
                          <span className="w-28 shrink-0 text-right font-semibold tabular-nums">
                            <MoneyText amount={asPaise(balance.tableTaxPaise)} />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="min-w-0 flex-1">
                            Invoice register ·{" "}
                            <span className="tabular-nums">
                              {period.registerDocuments} documents
                            </span>
                          </span>
                          <span className="w-16 shrink-0" />
                          <span className="w-32 shrink-0 text-right tabular-nums">
                            <MoneyText
                              amount={asPaise(period.registerTaxablePaise)}
                            />
                          </span>
                          <span className="w-28 shrink-0 text-right tabular-nums">
                            <MoneyText
                              amount={asPaise(period.registerTaxPaise)}
                            />
                          </span>
                        </div>

                        <p
                          className={cn(
                            "mt-2 flex items-center gap-1.5 text-sm font-medium",
                            balance.balanced
                              ? "text-success"
                              : "text-destructive",
                          )}
                        >
                          {balance.incomplete ? (
                            <>
                              <TriangleAlert className="size-4" />
                              Cannot be footed — a table failed to compute.
                            </>
                          ) : balance.balanced ? (
                            <>
                              <CircleCheck className="size-4" />
                              Reconciles to the paisa.
                            </>
                          ) : (
                            <>
                              <CircleAlert className="size-4" />
                              {/* The gap, not the totals — that is the number
                                  that finds the defect. */}
                              Out by{" "}
                              {formatPaiseDelta(balance.taxableDifferencePaise)}{" "}
                              taxable and{" "}
                              {formatPaiseDelta(balance.taxDifferencePaise)} tax.
                            </>
                          )}
                        </p>
                      </div>
                      </div>
                      </div>
                    </Panel>
                  </div>

                  {/* --------------- Readiness checklist --------------- */}
                  <div className="min-w-0 space-y-4 xl:col-span-2">
                    <Panel
                      title="Readiness"
                      icon={ListChecks}
                      caption="Every row is a count and somewhere to go"
                      tone="support"
                      flush
                    >
                      {[...blocking, ...informational, ...clear].map((row) => {
                        const blocks = row.count > 0 && BLOCKS_EXPORT[row.kind];
                        const settled = row.count === 0;
                        return (
                          <div
                            key={row.kind}
                            className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0"
                          >
                            <span
                              className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-md",
                                blocks
                                  ? "bg-destructive/10 text-destructive"
                                  : settled
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {blocks ? (
                                <CircleAlert className="size-3.5" />
                              ) : settled ? (
                                <CircleCheck className="size-3.5" />
                              ) : (
                                <Info className="size-3.5" />
                              )}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block leading-tight">
                                {READINESS_LABEL[row.kind]}
                              </span>
                              {/*
                                The distinction that makes this list worth
                                reading: a credit note is information, a missing
                                HSN code stops the filing. Rendering them alike
                                puts that memory back on the accountant.
                              */}
                              {!settled ? (
                                <span
                                  className={cn(
                                    "block text-xs",
                                    blocks
                                      ? "text-destructive"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {blocks
                                    ? "Blocks the export"
                                    : "Review before filing — does not block"}
                                </span>
                              ) : null}
                            </span>

                            <span
                              className={cn(
                                "w-8 shrink-0 text-right font-semibold tabular-nums",
                                settled && "text-muted-foreground",
                              )}
                            >
                              {row.count}
                            </span>

                            {!settled ? (
                              <Button
                                variant="outline"
                                size="sm"
                                render={<Link href={row.href} />}
                                nativeButton={false}
                              >
                                {READINESS_ACTION[row.kind]}
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </Panel>
                  </div>
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
