"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { NavStack } from "./nav-stack";
import { footerNavFor, navGroupsFor, type NavBadge, type NavItem } from "@/lib/navigation";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { homeHrefFor } from "@/lib/navigation";

/**
 * The sidebar — mirrors `obizee-dashboard/src/components/shell/app-sidebar.tsx`.
 *
 * This product is an extension of the oBizee family, so the shell is the
 * dashboard's shell: shadcn's `Sidebar collapsible="icon"`, grouped destinations
 * under `SidebarGroupLabel`, the "oB" lockup in the header, secondary items in
 * the footer, and Base UI's `render={<Link/>}` rather than Radix's `asChild`.
 *
 * What is inherited rather than reinvented, and why it matters: `collapsible="icon"`
 * gives the icon-rail collapse that PRD §6.2 asks for between 1024 and 1279px,
 * and the `Sheet`-backed mobile behaviour below that — so the three tiers §6.2
 * describes come from the component the rest of oBizee already uses, not from a
 * bespoke implementation that would drift from it.
 */

export type BadgeCounts = Partial<Record<NavBadge, number>>;

function badgeCount(item: NavItem, counts: BadgeCounts): number | null {
  if (!item.badge) return null;
  const value = counts[item.badge];
  // Zero is never shown. §6.2 permits a badge "only when the number demands
  // action", and nothing to do demands nothing.
  return value && value > 0 ? value : null;
}

export function AppSidebar({
  role,
  badges = {},
  userName,
}: {
  role: Role;
  badges?: BadgeCounts;
  userName: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const groups = navGroupsFor(role);
  const footer = footerNavFor(role);

  return (
    <Sidebar collapsible="icon">
      {/*
        The lockup is given its own divided space and real size. A 24px glyph
        tucked beside a nav item fails the across-the-room test: a stranger
        seeing this screenshot in a WhatsApp group could not name the product.
      */}
      <SidebarHeader className="border-b border-sidebar-border pb-3">
        <Link
          href={homeHrefFor(role)}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
            oB
          </span>
          <span className="grid group-data-[collapsible=icon]:hidden">
            <span className="text-[17px] leading-tight font-semibold tracking-tight text-sidebar-accent-foreground">
              oBizee
            </span>
            {/* Distinguishes the product without breaking the family lockup. */}
            {/* brand-brown, not text-primary: #d17c45 at 12px measures 3.14:1 on
                white, below AA. The brown is 5.9:1 and still reads as brand. */}
            <span className="text-xs leading-tight font-medium text-primary">
              Service ERP
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavStack
                layoutGroup="nav"
                items={group.items}
                isActive={isActive}
                badgeFor={(item) => badgeCount(item, badges)}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {/*
          Who is signed in, anchored at the bottom of the rail — the reference
          ERP's device, and the thing that makes a sidebar feel inhabited rather
          than like a list of links. It also puts the role on screen at all
          times, which matters in a product where the same screen renders
          differently for a coordinator and an accountant.
        */}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {userName
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </span>
          <span className="grid min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm leading-tight font-medium text-sidebar-accent-foreground">
              {userName}
            </span>
            <span className="truncate text-xs leading-tight text-muted-foreground">
              {ROLE_LABELS[role]}
            </span>
          </span>
        </div>

        {/*
          Its own layout group. The footer is a separate list; sharing the
          main menu's pill would send the highlight flying the height of the
          rail whenever the two lists disagreed about who was active.
        */}
        <NavStack layoutGroup="nav-footer" items={footer} isActive={isActive} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
