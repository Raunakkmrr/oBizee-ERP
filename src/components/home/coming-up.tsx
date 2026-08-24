import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/shared/money-text";
import { toComputed, type HomeSnapshot } from "@/lib/data/home";

/**
 * Beat 4 — **where this is heading**.
 *
 * The one decision: *what is heading at me?* This is the section that turns a
 * record-keeping system into a decision system — everything above it describes
 * what already happened.
 *
 * Three forward-looking facts, each chosen because it decays if unattended:
 *
 * - **Receivables ageing** across §5.9's buckets. The 45-day boundary is present
 *   because it is the boundary the counterparty's tax position turns on
 *   (§37(2)(g)), which makes it a lever in a collection call rather than trivia.
 * - **AMC renewals inside 45 days** (FR-506) — a lapsed AMC is the
 *   highest-conversion lead this business will ever get.
 * - **Contracts under-delivering their committed visits.** §6.14 calls the
 *   `3 of 12` visit bar the highest-value element on the contract screen: it
 *   answers "are we delivering what we sold" in one glance, and a contract
 *   under-delivering is a renewal that will be lost.
 *
 * `Progress` earns its place here and nowhere else on this screen: visit
 * delivery genuinely is a count against a committed total, so the bar states a
 * fact rather than decorating one.
 */
export function ComingUp({
  comingUp,
  hideAmounts,
}: {
  comingUp: HomeSnapshot["comingUp"];
  hideAmounts: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coming up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">Receivables ageing</p>
          <div>
            {comingUp.ageing.map((bucket) => (
              <div
                key={bucket.label}
                className="flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <span className="text-muted-foreground">
                  {bucket.label}
                  <span className="ml-2 text-xs tabular-nums">
                    {bucket.count} invoices
                  </span>
                </span>
                <MoneyText
                  amount={toComputed(bucket.amount)}
                  hidden={hideAmounts}
                  className="font-medium"
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">AMC renewals due</p>
            <p className="text-xs text-muted-foreground">
              Within 45 days · worked as leads
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums">
              {comingUp.renewalsDue}
            </p>
            <MoneyText
              amount={toComputed(comingUp.renewalsValue)}
              hidden={hideAmounts}
              className="text-xs text-muted-foreground"
            />
          </div>
        </div>

        {comingUp.contractsUnderDelivering.length > 0 ? (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">Under-delivering visits</p>
              <div className="space-y-3">
                {comingUp.contractsUnderDelivering.map((contract) => {
                  const pct = Math.round(
                    (contract.visitsDone / contract.visitsCommitted) * 100,
                  );
                  return (
                    <div key={contract.id} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          {contract.customer}
                        </span>
                        {/* The count is the fact; the bar is the glance. */}
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {contract.visitsDone} of {contract.visitsCommitted}{" "}
                          visits
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        aria-label={`${contract.customer}: ${contract.visitsDone} of ${contract.visitsCommitted} visits delivered`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        <Separator />

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium tabular-nums">
              {comingUp.tomorrowJobs} jobs
            </span>{" "}
            tomorrow ·{" "}
            <span className="tabular-nums">
              {comingUp.tomorrowUnassigned} unassigned
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/today" />}
            nativeButton={false}
          >
            Plan tomorrow
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
