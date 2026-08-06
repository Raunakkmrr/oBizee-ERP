"use client";

import { useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { matchesQuery, rankForJob, type Person } from "@/lib/data/people";

/**
 * Choosing a technician, at any bench size.
 *
 * **What this replaces.** A row of chips, one per technician. That is fine for
 * four and unusable at fifty: the picker becomes a wall, there is nothing to
 * type at, and the reader has no way to tell which of the fifty can actually do
 * the job. The chip row was written against a fixture that happened to have
 * four people in it.
 *
 * Three things it does that the chip row could not:
 *
 * 1. **Ranks by fit** — skill first, then whether they are already working that
 *    area, then how loaded their day is. The best answer is at the top instead
 *    of wherever the array happened to put them.
 * 2. **Says why.** Every row carries its reason. A ranked list that will not
 *    explain itself is one people stop trusting and start scrolling past.
 * 3. **Never hides anyone.** Someone who cannot do the work sinks to the bottom
 *    and is marked, but stays selectable — the dispatcher may know something
 *    the skill list does not, and a picker that silently omits a real
 *    technician is worse than one that shows him greyed.
 *
 * The list is capped at ten with the remainder counted, so a fifty-person bench
 * does not push the rest of the screen off the fold. Typing narrows it.
 */
export function PersonPicker({
  people,
  job,
  loadFor,
  selectedId,
  onPick,
  onCancel,
}: {
  people: readonly Person[];
  job: { serviceType: string; locality: string };
  loadFor: (personId: string) => number;
  selectedId?: string | null;
  onPick: (person: Person) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");

  const ranked = useMemo(
    () => rankForJob(people, job, loadFor),
    [people, job, loadFor],
  );
  const matching = ranked.filter((fit) => matchesQuery(fit.person, query));
  const shown = matching.slice(0, 10);
  const hidden = matching.length - shown.length;

  return (
    <div className="w-full space-y-2 rounded-xl bg-muted p-2.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, skill or area"
            aria-label="Search technicians"
            className="pl-8"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {matching.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          {people.length === 0
            ? "No technicians on the strength yet — add one in Settings → People."
            : `Nobody matches “${query}”.`}
        </p>
      ) : null}

      <ul className="space-y-1">
        {shown.map((fit) => {
          const unable = fit.score === null;
          const selected = fit.person.id === selectedId;
          return (
            <li key={fit.person.id}>
              <button
                type="button"
                onClick={() => onPick(fit.person)}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold",
                    selected
                      ? "bg-black/15"
                      : unable
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary-bg text-primary-text",
                  )}
                >
                  {fit.person.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {fit.person.name}
                  </span>
                  <span
                    className={cn(
                      "block truncate text-xs",
                      selected
                        ? "text-primary-foreground/75"
                        : "text-muted-foreground",
                    )}
                  >
                    {fit.reasons.join(" · ")}
                  </span>
                </span>

                {unable ? (
                  <TriangleAlert
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        // Says what it is not showing. A silently truncated list reads as the
        // whole bench, and then somebody is never offered work.
        <p className="px-1 text-xs text-muted-foreground">
          {hidden} more — keep typing to narrow.
        </p>
      ) : null}
    </div>
  );
}
