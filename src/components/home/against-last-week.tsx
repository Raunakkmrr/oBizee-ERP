import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toneClasses } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";
import type { Comparison, HomeSnapshot } from "@/lib/data/home";

/**
 * Beat 3 — **trend and comparison**.
 *
 * The one decision: *is that good or bad?* A number without a comparison is a
 * support ticket waiting to happen, so nothing here appears without last week
 * beside it.
 *
 * **`better` is a separate field from `direction`, and that is the whole point
 * of this section.** Time-to-sign-off falling is good; collections falling is
 * bad. Deriving good/bad from the arrow would get one of those wrong, and an
 * owner who catches the product calling a good week bad stops trusting every
 * other number on the screen.
 *
 * §6.13.4: the arrow is the shape, the word is the word, the tone is the
 * colour — three channels, so the meaning survives a washed-out panel and the
 * roughly 1 in 12 Indian men with a colour vision deficiency. **No count-up
 * animation** (§6.13.8): an owner reading a figure that is still animating reads
 * a wrong number.
 */

const DIRECTION_ICON = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
} as const;

function ComparisonRow({ item }: { item: Comparison }) {
  const Icon = DIRECTION_ICON[item.direction];
  const tone = item.direction === "flat" ? "muted" : item.better ? "success" : "warning";

  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{item.label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">
          {item.current}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge
          variant="outline"
          className={cn("rounded-full font-medium", toneClasses[tone])}
        >
          <Icon aria-hidden="true" className="size-3" />
          {/* The word carries the meaning; the arrow and tone reinforce it. */}
          {item.changeWord}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">
          was {item.previous}
        </span>
      </div>
    </div>
  );
}

export function AgainstLastWeek({
  comparisons,
}: {
  comparisons: HomeSnapshot["comparisons"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Against last week</CardTitle>
      </CardHeader>
      <CardContent>
        <div>
          {comparisons.map((item) => (
            <ComparisonRow key={item.label} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
