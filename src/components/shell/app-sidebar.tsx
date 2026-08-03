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
import { ROLE_LABELS, type Role } from "@/lib/roles";

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
          href="/"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm">
            oB
          </span>
          <span className="grid group-data-[collapsible=icon]:hidden">
            <span className="text-[17px] leading-tight font-semibold tracking-tight">
              oBizee
            </span>
            {/* Distinguishes the product without breaking the family lockup. */}
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
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = badgeCount(item, badges);
                  return (
                    <SidebarMenuItem key={item.key}>
                      {/*
                        A tint alone is easy to miss at a glance across nine
                        destinations; the reference ERP pairs it with a left edge
                        bar and that is what makes the current location findable
                        without reading. Colour is not the only channel — the
                        bar is a shape (§6.13.4).
                      */}
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive(item.href)}
                        tooltip={item.label}
                        // `data-active` is a PRESENCE attribute here (`data-active=""`), not
                        // `data-active="true"` — the primitive sets it via Base UI's boolean
                        // form, so `data-[active=true]:` silently matches nothing.
                        className="relative data-active:before:absolute data-active:before:left-0 data-active:before:top-1/2 data-active:before:h-5 data-active:before:w-1 data-active:before:-translate-y-1/2 data-active:before:rounded-r-full data-active:before:bg-primary"
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

      <SidebarFooter className="border-t border-sidebar-border">
        {/*
          Who is signed in, anchored at the bottom of the rail — the reference
          ERP's device, and the thing that makes a sidebar feel inhabited rather
          than like a list of links. It also puts the role on screen at all
          times, which matters in a product where the same screen renders
          differently for a coordinator and an accountant.
        */}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:justify-center">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {userName
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </span>
          <span className="grid min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm leading-tight font-medium">
              {userName}
            </span>
            <span className="truncate text-xs leading-tight text-muted-foreground">
              {ROLE_LABELS[role]}
            </span>
          </span>
        </div>

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
