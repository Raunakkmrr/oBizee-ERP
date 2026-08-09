"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

/**
 * One travelling highlight, for however many lists sit inside it.
 *
 * **Why the pill lives here and not in `NavStack`.** The rail is several
 * `SidebarGroup`s — Overview, Work, Money, Operations, Insights — each
 * rendering its own list. Moving from Today to Jobs crosses a group boundary,
 * and a pill owned by a list can only fade out on one side and in on the other.
 * That throws away the thing the animation is for: it should say *you went from
 * there to here*, and a cross-fade says only *something changed*.
 *
 * It replaces a shared `layoutId` on a `motion.span`, which did the same job and
 * put 107 KB of framer-motion on the critical path of every screen — against a
 * 350 KB first-screen budget the app was missing by 43. The motion was worth
 * keeping; the dependency was not.
 *
 * Lists report their active row; the rail measures it against itself and moves
 * one absolutely-positioned element. The footer is its own rail, deliberately:
 * sharing the main menu's pill would send the highlight flying the height of
 * the sidebar whenever the two lists disagreed about who was active.
 */

/**
 * Eases out hard and does not pass its mark. An indicator that overshoots
 * briefly points at the wrong destination, which is worse than not moving.
 */
const TRAVEL =
  "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), height 260ms cubic-bezier(0.22, 1, 0.36, 1)";

type Rail = {
  /** A list tells the rail which of its rows is active, or that none is. */
  report: (listKey: string, row: HTMLElement | null) => void;
};

const RailContext = createContext<Rail | null>(null);

/** Null outside a rail, so a list can render perfectly well without one. */
export function useRail(): Rail | null {
  return useContext(RailContext);
}

export function NavRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  /** Keyed by list, so one list going quiet cannot erase another's answer. */
  const rows = useRef(new Map<string, HTMLElement>());
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);
  /** False until the pill has been somewhere, so it never slides in from nowhere. */
  const [placed, setPlaced] = useState(false);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const row = rows.current.values().next().value;
    if (!frame || !row) {
      setPill(null);
      return;
    }
    /*
      Offsets, not rectangles, and the difference matters.

      `getBoundingClientRect()` includes transforms — and the rows deal in with
      a `translateY(-10px)` keyframe. Measuring during that entrance placed the
      highlight nine and a half pixels above its row and left it there, because
      nothing changes size when a transform finishes so the observer never fired
      again. It looked like a rounding error and was permanent.

      `offsetTop` is layout position and ignores transforms, so it is right
      whether the animation has run, is running, was skipped, or is disabled.
      Walked up to the frame rather than read once, because every positioned
      ancestor in between resets what it is relative to.
    */
    let top = 0;
    let node: HTMLElement | null = row;
    while (node && node !== frame) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    setPill({ top, height: row.offsetHeight });
  }, []);

  const report = useCallback(
    (listKey: string, row: HTMLElement | null) => {
      if (row) rows.current.set(listKey, row);
      else rows.current.delete(listKey);
      measure();
    },
    [measure],
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    /*
      Rows change height when a label wraps, which happens on resize rather than
      on navigation — so measuring only when the route changes would leave the
      pill behind its row.
    */
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (pill && !placed) setPlaced(true);
  }, [pill, placed]);

  const value = useMemo(() => ({ report }), [report]);

  return (
    <RailContext.Provider value={value}>
      <div ref={frameRef} className={cn("relative", className)}>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-2 top-0 z-0 rounded-md bg-sidebar-accent",
            "motion-reduce:transition-none",
            pill ? "opacity-100" : "opacity-0",
          )}
          style={{
            height: pill?.height ?? 0,
            transform: `translateY(${pill?.top ?? 0}px)`,
            // Nothing to animate from until it has been somewhere once.
            transition: placed ? TRAVEL : undefined,
          }}
        >
          {/*
            The edge bar rides along inside the pill. Colour is not the only
            channel (§6.13.4) — this is a shape, and it is what makes the
            current location findable without reading.
          */}
          <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
        </span>
        {children}
      </div>
    </RailContext.Provider>
  );
}
