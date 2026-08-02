"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavIcon } from "./nav-icon";
import {
  footerNavFor,
  navGroupsFor,
  type NavBadge,
  type NavItem,
} from "@/lib/navigation";
import type { Role } from "@/lib/roles";

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
}: {
  role: Role;
  badges?: BadgeCounts;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const groups = navGroupsFor(role);
  const footer = footerNavFor(role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center"
        >
          {/* The oBizee family mark, unchanged from the dashboard. */}
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary font-bold text-primary-foreground">
            oB
          </span>
          <span className="grid group-data-[collapsible=icon]:hidden">
            <span className="text-base leading-tight font-semibold tracking-tight">
              oBizee
            </span>
            {/* Distinguishes the product without breaking the family lockup. */}
            <span className="text-xs leading-tight text-muted-foreground">
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
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = badgeCount(item, badges);
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive(item.href)}
                        tooltip={item.label}
                      >
                        <NavIcon name={item.icon} className="size-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {count ? (
                        // The number alone is not the message (§6.13.4): the
                        // accessible name says what the count means, so it does
                        // not rely on colour or position to be understood.
                        <SidebarMenuBadge aria-label={`${count} need attention`}>
                          <span className="tnum">{count}</span>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {footer.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={isActive(item.href)}
                tooltip={item.label}
              >
                <NavIcon name={item.icon} className="size-4" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
