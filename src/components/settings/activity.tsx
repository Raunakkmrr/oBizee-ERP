"use client";

import { ScrollText, WifiOff } from "lucide-react";
import { AUDIT_LIMIT, whenWords } from "@/lib/data/audit";
import { useEffect, useState } from "react";
import { getAuditTrail, type AuditEntry } from "@/lib/data/audit";

/**
 * The audit trail — FR-1305.
 *
 * Every mutation, newest first, each naming a person. Two things it refuses to
 * do, both deliberate:
 *
 * - **No filter by actor.** With one browser and one acting user a filter would
 *   imply a multi-user history this build does not have.
 * - **No delete, no edit, no "clear log".** The trail's only value is that it
 *   cannot be tidied. A control to clear it would make every entry above it
 *   worthless.
 *
 * The cap is stated on the screen rather than hidden, because a reader who
 * assumes this is everything that ever happened would be wrong.
 */
export function Activity() {
  const [trail, setTrail] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void getAuditTrail().then((result) => {
      if (!cancelled && result.status === "ready") {
        setTrail([...result.data.entries]);
        setTotal(result.data.total);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <ScrollText className="size-4 text-primary-text" />
        Activity
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {/*
          It said "in this browser", which was true of a local trail and is a
          lie about a shared one — the wrong half of the firm's history to
          claim. And a list capped at fifty must say so, or "nothing after
          this" is read into a page break.
        */}
        Every change made in the firm, newest first. Entries are only ever
        added — nothing here can be edited or removed.
        {total > trail.length
          ? ` Showing the most recent ${trail.length} of ${total}.`
          : ""}
      </p>

      {trail.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted-bg p-4 text-sm text-muted-foreground">
          Nothing has been changed yet. Raise a job or an invoice and it will
          appear here.
        </p>
      ) : (
        <>
          <ol className="mt-4 grid gap-1.5">
            {trail.map((entry) => (
              <li
                key={entry.id}
                className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-muted-bg p-3"
              >
                <span className="min-w-0 flex-1 text-sm">{entry.summary}</span>

                {entry.origin === "offline_sync" ? (
                  // §6.5.2: an offline-origin event is stated, never presented
                  // as if it had been recorded at sync time.
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <WifiOff aria-hidden="true" className="size-3" />
                    recorded offline
                    {entry.occurredAt ? ` at ${whenWords(entry.occurredAt)}` : ""}
                  </span>
                ) : null}

                <span className="shrink-0 text-xs text-muted-foreground">
                  {entry.actor}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {whenWords(entry.at)}
                </span>
              </li>
            ))}
          </ol>

          {trail.length >= AUDIT_LIMIT ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the most recent {AUDIT_LIMIT}. Older entries were dropped —
              a full history needs the backend.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
