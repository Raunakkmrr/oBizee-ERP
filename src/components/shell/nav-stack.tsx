"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavIcon } from "./nav-icon";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";

/**
 * The animated navigation stack.
 *
 * Three motions, each doing a job rather than decorating:
 *
 * 1. **One highlight that travels.** There is a single pill in the whole menu,
 *    shared across every group by `layoutId`. On a route change it does not
 *    fade out here and in there — it *moves*, and the eye follows it to the new
 *    location. The animation carries the information "you went from there to
 *    here", which a cross-fade throws away.
 * 2. **The stack deals in.** On mount the rows settle from slightly above with
 *    a small scale, staggered, so the rail reads as a stack of cards coming to
 *    rest. It runs once: the sidebar lives in the layout and survives
 *    navigation.
 * 3. **Weight on hover.** The row shifts toward the reader and the icon grows
 *    slightly — enough to feel physical, small enough that moving down nine
 *    destinations is not a fight.
 *
 * **Why the entrance is CSS and only the pill is JS.**
 *
 * The first build did the entrance with motion variants and
 * `initial={{ opacity: 0 }}`. rAF is throttled in a backgrounded tab, so the
 * stagger froze part-way and left the navigation at opacity 0.07 — the primary
 * control in the product, invisible, until something happened to wake the
 * frame loop. Measured, not theorised.
 *
 * The rule that came out of it: **the resting state of navigation must never
 * depend on an animation completing.** The entrance is now a CSS keyframe with
 * `backwards` fill, so a throttled, skipped or disabled animation still ends
 * with a visible row. The pill keeps using motion because its failure mode is
 * benign — worst case it appears in the right place without sliding.
 *
 * `prefers-reduced-motion` removes all of it rather than slowing it down.
 * Vestibular triggers are not a setting to half-honour.
 *
 * PRD §6.13.8 forbids list *entrance* animations, and that stands for data
 * lists — an owner must never read a figure that is still moving. Navigation
 * chrome carries no figures, and animating it was asked for directly.
 */

/**
 * Tuned so the pill arrives without overshooting past the next item. An
 * indicator that bounces beyond its target briefly points at the wrong
 * destination.
 */
const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const;

/** Per-row delay for the deal-in. Nine rows finish inside ~700ms. */
const STAGGER_MS = 35;

export function NavStack({
  items,
  isActive,
  badgeFor,
  /**
   * Namespaces the shared pill. The main menu and the footer menu are separate
   * lists; sharing one highlight would send it flying the height of the rail
   * whenever the two disagreed about who was active.
   */
  layoutGroup,
}: {
  items: readonly NavItem[];
  isActive: (href: string) => boolean;
  badgeFor?: (item: NavItem) => number | null;
  layoutGroup: string;
}) {
  const still = useReducedMotion();

  return (
    <SidebarMenu>
      {items.map((item, index) => {
        const active = isActive(item.href);
        const count = badgeFor?.(item) ?? null;

        return (
          <SidebarMenuItem
            key={item.key}
            className="animate-nav-deal motion-reduce:animate-none"
            style={{ animationDelay: `${index * STAGGER_MS}ms` }}
          >
            {/*
              The travelling highlight, positioned behind the button rather than
              being the button's own background — only then can it be one
              element moving between two rows instead of two elements changing
              colour.
            */}
            {active ? (
              <motion.span
                layoutId={`${layoutGroup}-active`}
                transition={still ? { duration: 0 } : SPRING}
                aria-hidden="true"
                className="absolute inset-0 rounded-md bg-sidebar-accent"
              >
                {/*
                  The edge bar rides along inside the pill. Colour is not the
                  only channel (§6.13.4) — this is a shape, and it is what makes
                  the current location findable without reading.
                */}
                <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              </motion.span>
            ) : null}

            <SidebarMenuButton
              render={<Link href={item.href} />}
              isActive={active}
              tooltip={item.label}
              className={cn(
                "relative z-10 transition-transform duration-200",
                // The primitive paints its own background when active. That
                // fill cannot travel, so it is suppressed and the pill above is
                // the only thing marking the active row.
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
              // name says what the count means, so it does not depend on colour
              // or position to be understood.
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
