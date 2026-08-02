"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BOARD_FILTERS,
  FILTER_LABEL,
  type Board,
  type BoardFilter,
} from "@/lib/data/board";

/**
 * The state strip — PRD §6.4.1.
 *
 * **The counters are filters, not decoration.** §6.4.1: "clicking one filters
 * the rows below and shows a removable filter chip". Rendering them as read-only
 * statistics would be the single most common way to get this screen wrong — the
 * coordinator's whole job is narrowing 14 rows to the 3 that need her now.
 *
 * There is deliberately **no "Total jobs today"** counter. §6.4.1 rejects it by
 * name as "a number nobody acts on", and `BoardFilter` is a closed union so a
 * sixth counter cannot be added without a deliberate contract change.
 *
 * Each tile is a real `<button>` with `aria-pressed`, so the filter state is
 * available to a screen reader and the whole strip is keyboard-operable — §6.6.3
 * makes the coordinator's fastest path keyboard-only by design.
 */
export function StateStrip({
  counters,
  active,
  onToggle,
}: {
  counters: Board["counters"];
  active: BoardFilter | null;
  onToggle: (filter: BoardFilter | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b bg-card px-3 py-2 lg:px-4">
      {BOARD_FILTERS.map((filter) => {
        const count = counters[filter];
        const isActive = active === filter;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(isActive ? null : filter)}
            className={cn(
              "flex shrink-0 items-baseline gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              isActive
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <span className="text-lg leading-none font-semibold tabular-nums">
              {count}
            </span>
            <span className="text-xs text-muted-foreground">
              {FILTER_LABEL[filter]}
            </span>
          </button>
        );
      })}

      {active ? (
        // The removable filter chip §6.4.1 requires. Without it a coordinator who
        // filtered two minutes ago reads an incomplete board as a complete one.
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Filtered to {FILTER_LABEL[active]}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggle(null)}
            aria-label={`Clear ${FILTER_LABEL[active]} filter`}
          >
            <X className="size-3" />
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}
