"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getAuditTrail, whenWords, type AuditEntry } from "@/lib/data/audit";
import { cn } from "@/lib/utils";

/**
 * The log, reachable from anywhere — FR-1305.
 *
 * **Why it moved out of Settings.** The trail was already complete: every
 * mutating route records who did it, what it was, and when, into a table a
 * trigger makes insert-only. It was reachable only through Settings → Activity,
 * six clicks from the board and behind a screen most people open once. A record
 * nobody can find answers no questions, and the questions it answers — *who
 * moved that job, who converted that lead, who added that person* — are asked
 * while looking at the thing, not while sitting in Settings.
 *
 * **Read-only, and it has to be.** There is no filter that deletes, no button
 * that tidies, and no export that omits. `audit_entries` refuses UPDATE and
 * DELETE at the database, so the panel could not offer those even if somebody
 * asked — which is the point of the guarantee rather than an inconvenience of
 * it.
 *
 * Fetched when the panel opens rather than on every page load. Fifty entries is
 * a small payload but nobody should pay for it on the way to the board.
 */

/** What each kind of change is, in a word a non-engineer reads. */
function kindOf(action: string): { label: string; tone: string } {
  if (/^(CREATE|ADD|RECORD|CAPTURE|RAISE|ISSUE)/.test(action)) {
    return { label: "Added", tone: "bg-success/12 text-success" };
  }
  if (/^(DELETE|DISCARD|REMOVE|DEACTIVATE|CANCEL)/.test(action)) {
    return { label: "Removed", tone: "bg-destructive/12 text-destructive" };
  }
  return { label: "Changed", tone: "bg-info/12 text-info" };
}

export function ActivityLog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    void getAuditTrail()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "ready") setEntries([...result.data.entries]);
        else if (result.status === "failed") setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Activity log — who changed what">
            <ScrollText className="size-4" />
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ScrollText className="size-4" /> Activity log
          </SheetTitle>
          <SheetDescription>
            Every change, who made it, and when. Nothing here can be edited or removed.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 overflow-y-auto px-4 pb-6">
          {failed ? (
            <p className="py-8 text-center text-sm text-warning">
              The log could not be reached. It is still being written — this is the reading of it
              that failed.
            </p>
          ) : entries === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Reading the log…</p>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          ) : (
            <ol className="relative space-y-0">
              {entries.map((entry, index) => {
                const kind = kindOf(entry.action);
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr] gap-x-3 py-3",
                      index > 0 && "border-t border-border/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 h-fit rounded-full px-2 py-0.5 text-[11px] font-medium",
                        kind.tone,
                      )}
                    >
                      {kind.label}
                    </span>
                    <div className="min-w-0">
                      {/* The sentence first: it is what somebody is actually looking for. */}
                      <p className="text-sm break-words">{entry.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{entry.actor}</span>
                        {" · "}
                        {whenWords(entry.at)}
                        {entry.origin === "offline_sync" ? (
                          // FR-1305 names offline origin explicitly: a change made
                          // on a phone in a basement and synced later is not the
                          // same fact as one typed at a desk.
                          <span className="ml-1.5 rounded bg-muted px-1 py-px text-[10px]">
                            synced from the field
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
