"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { OUTCOMES, isTerminalOutcome, type Lead } from "@/lib/data/leads";
import { logLeadOutcome } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * Log outcome — PRD §6.6.3.
 *
 * **A 320px popover, not a page.** The coordinator is working a queue; sending
 * her to a detail screen and back for every call is the cost this avoids.
 *
 * Two rules from the spec are load-bearing:
 *
 * 1. **The next follow-up date is mandatory and pre-filled with +2 days**
 *    (FR-104). A lead without a date gets forgotten, and FR-104 blocks the save
 *    outright with that exact reasoning — so Save is disabled until there is
 *    one, and the field carries the requirement in words rather than an asterisk.
 * 2. **Saving returns focus to the next row**, "so a coordinator can work 20
 *    leads without touching the mouse" (§6.6.3). That is why `onSaved` exists
 *    rather than the popover simply closing.
 *
 * Outcomes are a **closed list** (§6.6.3, FR-105's reasoning): free text alone
 * is useless for reporting, and incentives are paid on this data.
 *
 * Two consequences of the closed list that the spec text does not spell out but
 * the rules imply:
 *
 * - **Won and Lost do not take a follow-up date.** FR-104's block exists so a
 *   live lead is never forgotten; a won or lost lead has left the queue, and
 *   demanding a date for it would be a field with no answer.
 * - **Won is where conversion happens** (FR-106). It is the only moment the
 *   coordinator knows the deal is real, so the choice — one-off work order or an
 *   AMC contract — is offered here rather than as a fourth control on a 52px
 *   row, and the customer, site and quoted value travel in the link.
 */
function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function LogOutcome({
  lead,
  onSaved,
}: {
  lead: Lead;
  onSaved: () => void;
}) {
  const log = useMutation(logLeadOutcome);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Pre-filled +2 days (§6.6.3) — a default she can change, never a blank she
  // must remember to fill.
  const [followUp, setFollowUp] = useState(plusDays(2));
  const [note, setNote] = useState("");

  // Won and Lost end the lead's life in the queue, so no next date is asked for.
  const terminal = outcome !== null && isTerminalOutcome(outcome);
  const won = outcome === "Won";

  async function save() {
    if (!outcome) return;

    /*
      Won and Lost are stage changes as well as outcomes — they take the lead
      out of the queue, and the register is the only place that can clear the
      next date without breaking FR-104's "a lead with no date gets forgotten".

      The date goes up as an instant. A follow-up is a moment, not a day: "call
      after lunch" and "call first thing" are different promises, and the queue
      sorts on it.
    */
    const result = await log.run(lead.id, {
      outcome,
      note: note.trim() || undefined,
      ...(terminal
        ? { stage: outcome === "Won" ? "WON" : "LOST", nextFollowUpAt: null }
        : { nextFollowUpAt: new Date(`${followUp}T09:00:00`).toISOString() }),
    });
    if (!result?.ok) return;

    setOpen(false);
    setOutcome(null);
    setNote("");
    setFollowUp(plusDays(2));
    onSaved();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            Log outcome
          </Button>
        }
      />
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium">{lead.name}</p>

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Outcome</p>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={outcome === option}
                  onClick={() => setOutcome(option)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    outcome === option
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor={`note-${lead.id}`}
              className="mb-1.5 block text-xs text-muted-foreground"
            >
              Note
            </label>
            <Input
              id={`note-${lead.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="One line"
            />
          </div>

          {!terminal ? (
            <div>
              <label
                htmlFor={`followup-${lead.id}`}
                className="mb-1.5 block text-xs text-muted-foreground"
              >
                Next follow-up — required
              </label>
              <Input
                id={`followup-${lead.id}`}
                type="date"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
              {!followUp ? (
                // FR-104's exact message, because the reason is the point.
                <p className="mt-1 text-xs text-destructive">
                  Set the next follow-up date — a lead without a date gets
                  forgotten.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {won
                ? "Won — this lead leaves the follow-up queue."
                : "Lost — this lead leaves the follow-up queue."}
            </p>
          )}

          {/*
            Conversion used to live here, behind "Won", inside this popover —
            the highest-value moment in an AMC business hidden behind an
            unrelated choice. It is now a page of its own, reachable from the
            row whether or not an outcome has been logged. See /leads/convert.
          */}

          {/*
            **A refused outcome said nothing.**

            `save()` ended in `if (!result?.ok) return;` — the popover stayed
            open, the chips stayed selected, and nothing anywhere said why. To
            the person who had just put the phone down it looked like a button
            that did not work, and the call they had just made went unrecorded.

            Inside the popover rather than on the page behind it: this control
            is a layer above the queue, and a message that appears underneath
            the thing covering it is a message nobody sees.
          */}
          {log.error ? (
            <ErrorState error={log.error} onRetry={log.reset} />
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={!outcome || (!terminal && !followUp) || log.pending}
            >
              {won ? "Save without converting" : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
