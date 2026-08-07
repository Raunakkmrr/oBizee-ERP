"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarSync, Wrench } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDispatch } from "@/lib/data/use-store";

/**
 * Convert a won lead — FR-106, as a page.
 *
 * **What this replaces.** Conversion lived inside the "Log outcome" popover on
 * a lead row, and the two choices did not appear until the reader had picked
 * "Won". So the single highest-value moment in an AMC-led business was hidden
 * behind an unrelated decision, in a popover, on a screen whose own rule is
 * that forms are pages.
 *
 * **Why the choice is up front and explained.** A one-off job and an AMC are
 * genuinely different products, and the difference is not obvious from their
 * names: one bills once and ends, the other generates a year of visits and
 * invoices and then asks to be renewed. Somebody closing a deal at four in the
 * afternoon should not have to remember which is which.
 *
 * Choosing either marks the lead won — conversion implies it — so the outcome
 * is never logged twice or forgotten.
 */
export function ConvertLeadForm({
  leadId,
  reference,
  customer,
  site,
  value,
}: {
  leadId: string | null;
  reference: string | null;
  customer: string | null;
  site: string | null;
  value: string | null;
}) {
  const dispatch = useDispatch();
  const router = useRouter();

  const carry = new URLSearchParams({
    ...(reference ? { fromLead: reference } : {}),
    ...(customer ? { customer } : {}),
    ...(site ? { site } : {}),
    ...(value ? { value } : {}),
  }).toString();

  function convertTo(href: string) {
    // Conversion implies the lead is won, so it is recorded here rather than
    // asked for again on the next screen.
    if (leadId) {
      dispatch({
        type: "LOG_LEAD_OUTCOME",
        leadId,
        outcome: "Won",
        note: "Won — converted",
        followUp: null,
      });
    }
    router.push(`${href}?${carry}`);
  }

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/leads" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to leads
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Work" }, { label: "Leads", href: "/leads" }]}
          className="mb-4"
          title={customer ? `Convert ${customer}` : "Convert this lead"}
          description="Two different products. Pick the one they actually bought."
        />

        <div className="grid max-w-4xl gap-3 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <span className="grid size-10 place-items-center rounded-full bg-primary-bg text-primary-text">
                <CalendarSync className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">AMC contract</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  They are buying a year of someone turning up.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>Visits appear on the board on their own dates</li>
                  <li>Invoices come due on a schedule you set</li>
                  <li>A renewal reaches you 45 days before it lapses</li>
                </ul>
              </div>
              <Button className="mt-2" onClick={() => convertTo("/contracts/new")}>
                Set up the contract
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Wrench className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">One-off work order</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  They have one thing that needs fixing.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>One job, assigned and scheduled today</li>
                  <li>One invoice when the work is done</li>
                  <li>Nothing recurs — you call them, not the calendar</li>
                </ul>
              </div>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => convertTo("/jobs/new")}
              >
                Raise the work order
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="mt-4 max-w-4xl text-xs text-muted-foreground">
          Either choice marks {customer ?? "this lead"} as won and takes it out
          of the follow-up queue.
        </p>
      </div>
    </AppShell>
  );
}
