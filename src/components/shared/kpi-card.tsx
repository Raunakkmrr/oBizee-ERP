import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Compact KPI tile — copied from `obizee-dashboard/src/components/shared/
 * kpi-card.tsx`: `Card gap-0`, `CardContent p-4`, a `text-sm` muted label, a
 * `text-2xl font-semibold tracking-tight` value, an optional `text-xs` hint, and
 * a `size-9 rounded-lg bg-primary/10 text-primary` icon chip.
 *
 * Two constraints this component carries into the ERP, both from §6.13.8 and
 * both about numbers being *read* rather than admired:
 *
 * - **No count-up animation on the value, ever.** §6.13.8 forbids it by name:
 *   "an owner reading a money figure that is still animating reads a wrong
 *   number". There is deliberately no `animate` prop to reach for.
 * - **The value is a `ReactNode`**, so callers pass `<MoneyText>` and an
 *   unavailable figure arrives as an em-dash rather than as a zero. A tile that
 *   accepted `value: number` would invite `?? 0`, which is the §6.3 defect.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <div className="mt-1 text-2xl font-semibold tracking-tight">
            {value}
          </div>
          {hint ? (
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          ) : null}
        </div>
        {Icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
