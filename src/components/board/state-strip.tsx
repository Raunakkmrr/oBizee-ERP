"use client";

import {
  CircleDollarSign,
  MapPin,
  PackageX,
  UserX,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
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
/**
 * Each counter gets an icon and a tone.
 *
 * These were five identical outlined boxes, which is a filter row wearing a
 * dashboard's clothes: the coordinator had to read every label to find the one
 * that matters. §6.4.1 already ranks them — `unassigned` is "the most expensive
 * number on the screen" and `done_not_billed` is "the number that makes an owner
 * buy the product" — so the strip now shows that ranking rather than describing
 * it in a comment.
 *
 * The tone is never the only channel: the label is always present (§6.13.4).
 */
const COUNTER_META: Record<
  BoardFilter,
  { icon: LucideIcon; tone: "bad" | "info" | "brand" | "warn" | "good" }
> = {
  unassigned: { icon: UserX, tone: "bad" },
  en_route: { icon: MapPin, tone: "info" },
  on_site: { icon: Wrench, tone: "brand" },
  parts_awaited: { icon: PackageX, tone: "warn" },
  done_not_billed: { icon: CircleDollarSign, tone: "good" },
};

const CHIP_TONE = {
  bad: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  brand: "bg-primary/10 text-primary",
  warn: "bg-warning/15 text-brand-brown",
  good: "bg-success/10 text-success",
} as const;

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
    <div className="flex items-stretch gap-2.5 overflow-x-auto border-b bg-card px-3 py-3 lg:px-4">
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
              "flex min-w-[152px] shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              isActive
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/25"
                : "border-border bg-background hover:border-border hover:bg-muted hover:shadow-sm",
            )}
          >
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                CHIP_TONE[COUNTER_META[filter].tone],
              )}
            >
              {(() => {
                const Icon = COUNTER_META[filter].icon;
                return <Icon className="size-5" />;
              })()}
            </span>
            <span className="min-w-0">
              {/* The figure is the point of the tile; at text-xl it was the
                  same weight as a row's customer name. */}
              <span className="block text-2xl leading-none font-semibold tracking-tight tabular-nums">
                {count}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {FILTER_LABEL[filter]}
              </span>
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
