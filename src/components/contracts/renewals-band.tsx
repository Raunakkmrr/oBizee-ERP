"use client";

import { CalendarClock, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { renewalsDue, RENEWAL_SOURCE, type Contract } from "@/lib/data/contracts";
import { useCallback, useEffect, useState } from "react";
import { getLeads, type Lead } from "@/lib/data/leads";
import { workRenewalAsLead } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";

/**
 * AMC renewals inside 45 days — FR-506.
 *
 * **Why a button and not a reminder.** The home screen has said *"worked as
 * leads"* since the first build, and nothing turned a renewal into a lead. A
 * renewal has a value, a decision-maker, a close date and a real chance of being
 * lost — that is a deal, and the pipeline already handles deals, with silence
 * detection and an owner. A renewal sitting in a notification is a deal nobody
 * is accountable for.
 *
 * Soonest first: the contract expiring on Friday is the call to make today.
 * Once worked, the row states that it is in the pipeline rather than
 * disappearing — vanishing would read as "handled" to the next person to look.
 */
export function RenewalsBand({ contracts }: { contracts: readonly Contract[] }) {
  /*
    Which renewals are already being worked, asked of the pipeline rather than
    tracked on the contract — one source of truth, and it survives a lead
    being reassigned. From the register now, so a colleague's renewal lead is
    visible instead of only this browser's.
  */
  const [renewalLeads, setRenewalLeads] = useState<Lead[]>([]);
  const reload = useCallback(() => {
    void getLeads().then((result) => {
      if (result.status === "ready") {
        setRenewalLeads(result.data.leads.filter((lead) => lead.source === RENEWAL_SOURCE));
      }
    });
  }, []);
  useEffect(reload, [reload]);

  const work = useMutation(
    useCallback(
      async (contractId: string) => {
        const result = await workRenewalAsLead(contractId);
        if (result.ok) reload();
        return result;
      },
      [reload],
    ),
  );

  /*
    A renewal lead records the contract it came from in its activity line, so
    "already worked" is asked of the pipeline rather than tracked on the
    contract — one source of truth, and it survives a lead being reassigned.
  */
  const worked = new Set(
    contracts
      .filter((contract) =>
        renewalLeads.some((lead) =>
          lead.lastActivity?.text.startsWith(contract.reference),
        ),
      )
      .map((contract) => contract.id),
  );

  const due = renewalsDue(contracts, worked);
  if (due.length === 0) return null;

  return (
    <section
      aria-label="AMC renewals due"
      className="mb-4 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <CalendarClock className="size-4 text-primary-text" />
          Renewals due
        </h2>
        <p className="text-xs text-muted-foreground">
          Within 45 days &middot; the highest-conversion lead this business gets
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {due.map(({ contract, daysToExpiry, worked: isWorked }) => (
          <div
            key={contract.id}
            // `min-w-0`: grid item, whose min-width is `auto`.
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3",
              daysToExpiry <= 15 ? "bg-warning-bg" : "bg-muted-bg",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {contract.customer}{" "}
                <span className="text-muted-foreground tnum-id">
                  {contract.reference}
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {/* Days, not a date: "in 12 days" is the urgency, "31 Mar" is trivia. */}
                Expires in {daysToExpiry} day{daysToExpiry === 1 ? "" : "s"}{" "}
                &middot; {contract.site}
              </p>
            </div>

            <MoneyText
              amount={asPaise(contract.annualValuePaise)}
              className="shrink-0 text-sm font-medium"
            />

            {isWorked ? (
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-success">
                <CircleCheck aria-hidden="true" className="size-3.5" />
                In the pipeline
              </span>
            ) : (
              <Button
                size="sm"
                variant={daysToExpiry <= 15 ? "default" : "outline"}
                disabled={work.pending}
                onClick={() => void work.run(contract.id)}
              >
                Work as a lead
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
