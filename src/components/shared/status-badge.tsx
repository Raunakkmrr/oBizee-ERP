import { Badge } from "@/components/ui/badge";
import { jobStateTone, leadStateTone, toneClasses } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

/**
 * Status pill — mirrors `obizee-dashboard/src/components/shared/status-badge.tsx`.
 *
 * Same component contract, same `Badge variant="outline"` + `rounded-full
 * font-medium`, same tone classes. Only the status vocabulary differs: job and
 * lead states (PRD §4.1, §4.2) instead of order statuses.
 *
 * **§6.13.4's channel rule is enforced here and is not negotiable**, especially
 * after DR-13 lowered contrast: a status carries a **word** always, and the
 * outline variant supplies a **shape** (border) as the second non-colour
 * channel. Red is auspicious in India and roughly 1 in 12 Indian men has a
 * colour vision deficiency — colour alone was never sufficient, and is now
 * further from sufficient.
 */
export function StatusBadge({
  status,
  kind = "job",
  className,
}: {
  status: string;
  kind?: "job" | "lead";
  className?: string;
}) {
  const table = kind === "lead" ? leadStateTone : jobStateTone;
  const meta = table[status] ?? { label: status, tone: "muted" as const };

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full font-medium",
        toneClasses[meta.tone],
        className,
      )}
    >
      {meta.label}
    </Badge>
  );
}
