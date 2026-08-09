"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { NavIcon } from "./nav-icon";
import { useRail } from "./nav-rail";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

/**
 * The animated navigation stack.
 *
 * Three motions, each doing a job rather than decorating:
 *
 * 1. **One highlight that travels.** There is a single pill per menu. On a
 *    route change it does not fade out here and in there — it *moves*, and the
 *    eye follows it to the new location. The animation carries the information
 *    "you went from there to here", which a cross-fade throws away.
 * 2. **The stack deals in.** On mount the rows settle from slightly above with
 *    a small scale, staggered, so the rail reads as a stack of cards coming to
 *    rest. It runs once: the sidebar lives in the layout and survives
 *    navigation.
 * 3. **Weight on hover.** The row shifts toward the reader and the icon grows
 *    slightly — enough to feel physical, small enough that moving down nine
 *    destinations is not a fight.
 *
 * **Why none of it is a library any more.**
 *
 * The pill used to be a `motion.span` with a shared `layoutId`, and that one
 * element put framer-motion — 107 KB gzipped — on the critical path of every
 * screen in the product, against a 350 KB first-screen budget the app was
 * missing by 43 KB. The motion was worth keeping and the dependency was not:
 * a travelling highlight is one absolutely-positioned element and a
 * `translateY`, measured off the active row. Same movement, same spring-ish
 * curve, nothing to download.
 *
 * The first build did the *entrance* with motion variants and
 * `initial={{ opacity: 0 }}`. rAF is throttled in a backgrounded tab, so the
 * stagger froze part-way and left the navigation at opacity 0.07 — the primary
 * control in the product, invisible, until something happened to wake the frame
 * loop. Measured, not theorised.
 *
 * The rule that came out of it holds for the pill too: **the resting state of
 * navigation must never depend on an animation completing.** The entrance is a
 * CSS keyframe with `backwards` fill, and the pill's resting state is its
 * `transform` — a skipped transition lands it in the right place instantly
 * rather than leaving it in the wrong one.
 *
 * `prefers-reduced-motion` removes all of it rather than slowing it down.
 * Vestibular triggers are not a setting to half-honour.
 *
 * PRD §6.13.8 forbids list *entrance* animations, and that stands for data
 * lists — an owner must never read a figure that is still moving. Navigation
 * chrome carries no figures, and animating it was asked for directly.
 */

/** Per-row delay for the deal-in. Nine rows finish inside ~700ms. */
const STAGGER_MS = 35;

export function NavStack({
  items,
  isActive,
  badgeFor,
  /**
   * Names this list to the rail. Two lists must not overwrite each other's
   * answer to "which row is active" — only one of them ever has one.
   */
  group,
}: {
  items: readonly NavItem[];
  isActive: (href: string) => boolean;
  badgeFor?: (item: NavItem) => number | null;
  group: string;
}) {
  const rail = useRail();
  const listRef = useRef<HTMLUListElement>(null);
  const activeIndex = items.findIndex((item) => isActive(item.href));

  useLayoutEffect(() => {
    if (!rail) return;
    const row = activeIndex >= 0 ? (listRef.current?.children[activeIndex] as HTMLElement) : null;
    rail.report(group, row ?? null);
    // Let go on unmount, or the rail keeps pointing at a row that is gone.
    return () => rail.report(group, null);
  }, [rail, group, activeIndex]);

  return (
    <SidebarMenu ref={listRef}>
        {items.map((item, index) => {
          const active = isActive(item.href);
          const count = badgeFor?.(item) ?? null;

          return (
            <SidebarMenuItem
              key={item.key}
              className="animate-nav-deal motion-reduce:animate-none"
              style={{ animationDelay: `${index * STAGGER_MS}ms` }}
            >
              <SidebarMenuButton
                render={<Link href={item.href} />}
                isActive={active}
                tooltip={item.label}
                className={cn(
                  "relative z-10 transition-transform duration-200",
                  // The primitive paints its own background when active. That
                  // fill cannot travel, so it is suppressed and the pill behind
                  // is the only thing marking the active row.
                  "data-active:bg-transparent",
                  "hover:translate-x-0.5 motion-reduce:hover:translate-x-0",
                )}
              >
                <NavIcon
                  name={item.icon}
                  className={cn(
                    "size-4 transition-transform duration-200",
                    "group-hover/menu-button:scale-110 motion-reduce:group-hover/menu-button:scale-100",
                    active && "text-primary",
                  )}
                />
                <span>{item.label}</span>
              </SidebarMenuButton>

              {count ? (
                // The number alone is not the message (§6.13.4): the accessible
                // name says what the count means, so it does not depend on
                // colour or position to be understood.
                <SidebarMenuBadge
                  aria-label={`${count} need attention`}
                  className="animate-badge-pop motion-reduce:animate-none"
                  style={{ animationDelay: `${index * STAGGER_MS + 120}ms` }}
                >
                  <span className="tnum">{count}</span>
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          );
        })}
    </SidebarMenu>
  );
}
