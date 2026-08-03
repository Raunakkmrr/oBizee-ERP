import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type BadgeCounts } from "./app-sidebar";
import { TopBar, type Freshness } from "./top-bar";
import type { Role } from "@/lib/roles";

/**
 * The operator chrome — the same composition the oBizee dashboard uses:
 * `SidebarProvider` → `AppSidebar` + `SidebarInset` containing a sticky
 * `TopBar` and the page.
 *
 * Using the provider rather than hand-rolled offsets is what makes the three
 * navigation tiers in PRD §6.2 fall out for free: the labelled rail, the
 * icon-collapsed rail, and the sheet on small viewports all come from
 * `collapsible="icon"`, and the inset handles its own spacing — so the shell
 * cannot drift away from the rest of oBizee as either product changes.
 *
 * **Not used by the technician app.** §6.13.1's two-brand rule gives that
 * surface the *tenant's* branding rather than oBizee's, and it is a separate
 * React Native codebase under DR-4 in any case.
 */
export function AppShell({
  role,
  userName,
  today,
  freshness,
  badges,
  hideAmounts,
  onToggleAmounts,
  children,
}: {
  role: Role;
  userName: string;
  today: Date;
  freshness: Freshness;
  badges?: BadgeCounts;
  hideAmounts?: boolean;
  onToggleAmounts?: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar role={role} badges={badges} userName={userName} />
      <SidebarInset>
        <TopBar
          role={role}
          userName={userName}
          today={today}
          freshness={freshness}
          hideAmounts={hideAmounts}
          onToggleAmounts={onToggleAmounts}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
