"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChartColumn, Download, Scale } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shared/panel";
import { cn } from "@/lib/utils";
import { asPaise } from "@/lib/money";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import {
  conversionRate,
  filterCaption,
  getReports,
  worstDwell,
  type ReportsData,
} from "@/lib/data/reports";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * Reports / Review — §6.14.
 *
 * **The one decision:** *what changed this week and who needs attention?*
 *
 * **A short fixed set, not a builder.** Six reports, always the same six, always
 * in the same order. A builder answers every question badly and none by default.
 *
 * §6.14 permits charts **here and only here**, and requires that "every chart is
 * accompanied by the table it was drawn from". So each bar row carries its own
 * figures inline — the bar is an aid to comparison, never the only channel
 * (§6.13.4), and the number is always readable without measuring a rectangle.
 */
function Bar({ pct, tone }: { pct: number; tone?: "danger" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "danger" ? "bg-destructive" : "bg-primary",
        )}
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function ReportCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <Panel
      title={title}
      icon={ChartColumn}
      // FR-1002: the filters travel with every export, so they are on screen
      // too — a figure without its period is not evidence.
      caption={caption}
      actions={
        <Button variant="outline" size="sm">
          <Download className="size-3.5" />
          Export
        </Button>
      }
    >
      {children}
    </Panel>
  );
}

export default function ReportsPage() {
  const [query, setQuery] = useState<Query<ReportsData>>(loading());

  useEffect(() => {
    let cancelled = false;
    getReports().then((result) => {
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
          breadcrumb={[{ label: "Money" }]}
          title="Reports &amp; GST"
          description="What changed this week, and who needs attention."
          actions={
            // §6.14 treats the GST workspace as its own screen with its own
            // decision — "can I file this period" is not "what changed this
            // week" — so it gets its own URL, which also makes it shareable
            // with the CA rather than a tab state nobody can link to.
            <Button
              variant="outline"
              render={<Link href="/reports/gst" />}
              nativeButton={false}
            >
              <Scale className="size-4" />
              GST workspace
            </Button>
          }
        />

        <QueryBoundary query={query} label="reports" loadingRows={5}>
          {(data) => {
            const caption = filterCaption(data.filters);
            const worst = worstDwell(data.jobsByState);
            const maxRevenue = Math.max(
              ...data.revenueByService.map((r) => r.revenuePaise),
            );
            const maxDwell = Math.max(
              ...data.jobsByState.map((s) => s.avgHours * s.count),
            );

            return (
              <div className="space-y-4">
                {worst ? (
                  // The headline finding, in a sentence. §6.14 calls dwell time
                  // "usually the biggest hidden loss in the business", so the
                  // screen says it rather than leaving it to be spotted.
                  <p className="text-sm">
                    <span className="font-semibold tabular-nums">
                      {worst.state}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      is costing the most time — {worst.count} jobs averaging{" "}
                      <span className="tabular-nums">{worst.avgHours}h</span>{" "}
                      each.
                    </span>
                  </p>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  <ReportCard title="Revenue by service type" caption={caption}>
                    <div className="space-y-2">
                      {data.revenueByService.map((line) => (
                        <div key={line.serviceType} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">
                              {line.serviceType}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              <span className="text-muted-foreground">
                                {line.jobs} jobs ·{" "}
                              </span>
                              <MoneyText
                                amount={asPaise(line.revenuePaise)}
                                className="font-medium"
                              />
                            </span>
                          </div>
                          <Bar pct={(line.revenuePaise / maxRevenue) * 100} />
                        </div>
                      ))}
                    </div>
                  </ReportCard>

                  <ReportCard
                    title="Jobs by state, with time spent in each"
                    caption={caption}
                  >
                    <div className="space-y-2">
                      {data.jobsByState.map((state) => {
                        const total = state.avgHours * state.count;
                        const isWorst = state.state === worst?.state;
                        return (
                          <div key={state.state} className="space-y-1">
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <span
                                className={cn(
                                  "min-w-0 truncate",
                                  isWorst && "font-medium text-destructive",
                                )}
                              >
                                {state.state}
                              </span>
                              <span className="shrink-0 text-muted-foreground tabular-nums">
                                {state.count} jobs · {state.avgHours}h average
                              </span>
                            </div>
                            <Bar
                              pct={(total / maxDwell) * 100}
                              tone={isWorst ? "danger" : undefined}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </ReportCard>

                  <ReportCard title="Technician output" caption={caption}>
                    <div className="space-y-1.5">
                      {data.technicians.map((tech) => (
                        <div
                          key={tech.name}
                          className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate">{tech.name}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {tech.completed} done ·{" "}
                            {/* Too few ratings renders an em-dash. A 0.0 beside
                                a name is an accusation the data cannot support. */}
                            {tech.avgRating === null ? (
                              <span title="Too few ratings to report">
                                {EM_DASH}
                              </span>
                            ) : (
                              `${tech.avgRating.toFixed(1)}★`
                            )}{" "}
                            ·{" "}
                            {tech.firstVisitFixPct === null
                              ? EM_DASH
                              : `${tech.firstVisitFixPct}% first-visit fix`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ReportCard>

                  <ReportCard
                    title="Lead conversion by source and taken-by"
                    caption={caption}
                  >
                    <div className="space-y-1.5">
                      {data.conversion.map((line) => {
                        const rate = conversionRate(line);
                        return (
                          <div
                            key={`${line.source}-${line.takenBy}`}
                            className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              {line.source}
                              <span className="text-muted-foreground">
                                {" "}
                                · took {line.takenBy}
                              </span>
                            </span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {line.won} of {line.leads} ·{" "}
                              {rate === null ? (
                                // Named, not blank — the reader must know why.
                                <span className="text-xs">
                                  too few to rate
                                </span>
                              ) : (
                                <span className="font-medium text-foreground">
                                  {rate}%
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </ReportCard>
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
