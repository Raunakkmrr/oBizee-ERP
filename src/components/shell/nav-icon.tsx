import { CalendarClock, CalendarSync, ChartColumn, ClipboardList, Building2, FileClock, Package, PhoneCall, ReceiptIndianRupee, RefreshCw, Settings, Store, Users, Wrench } from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/navigation";

/**
 * Icon map for the navigation.
 *
 * Exhaustive over `NavIconName`, so adding a nav item without giving it an icon
 * is a compile error rather than a blank square discovered in review. Every name
 * was verified against the installed lucide-react — v1 renamed a great many
 * icons, so recalling them from memory would have produced silent failures.
 *
 * §6.13.10: one icon family, outline, 20px on web, **1.75px stroke** — heavier
 * than lucide's 2px default looks at small sizes but deliberately heavier than
 * the typical 1.5px, for legibility on the LCD panels §3.3 describes.
 */
const ICONS: Record<
  NavIconName,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  CalendarClock,
  Wrench,
  PhoneCall,
  FileClock,
  Building2,
  ReceiptIndianRupee,
  Package,
  ChartColumn,
  Settings,
  Users,
  ClipboardList,
  CalendarSync,
  RefreshCw,
  Store,
};

export function NavIcon({
  name,
  className = "size-5",
}: {
  name: NavIconName;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={1.75} />;
}
