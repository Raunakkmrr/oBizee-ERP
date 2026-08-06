"use client";

import { useEffect, useRef, useState } from "react";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";

/**
 * Drag and drop for the pipeline board.
 *
 * **Why Pragmatic DnD.** `dnd-kit`'s last release was December 2024 and
 * `react-dnd`'s was 2022 — both fail the house rule against adding a front-end
 * library whose last publish is over six months old. Pragmatic DnD is
 * Atlassian's, shipped in Jira and Trello, published this week, and is built on
 * the browser's own drag events, so it costs about 5kB rather than shipping a
 * synthetic pointer engine.
 *
 * **The accessibility catch, handled rather than inherited.** Pragmatic DnD
 * deliberately provides *no* keyboard drag; Atlassian's own guidance is to
 * offer a separate accessible action instead of emulating a mouse with arrow
 * keys. A drag-only board would leave every keyboard user unable to move a
 * lead, which the house rules forbid outright. So every card also carries a
 * `Move to` menu that dispatches exactly the same action — the drag is the
 * shortcut, not the only route.
 */

/** A card that can be picked up. Returns the ref to spread onto the element. */
export function useDraggableCard(leadId: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return draggable({
      element,
      getInitialData: () => ({ leadId }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [leadId]);

  return { ref, dragging };
}

/**
 * A column that can receive a card.
 *
 * `isOver` is tracked so the column can say so. A drop target that gives no
 * feedback until the mouse is released is a guess — the reader has to let go to
 * find out whether it would have worked.
 */
export function useDropColumn(
  stage: string,
  onDrop: (leadId: string, stage: string) => void,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);

  /*
    The callback is held in a ref rather than listed as an effect dependency.
    The page passes an inline arrow, so its identity changes on every render —
    depending on it would tear down and re-register the drop target constantly,
    and a target that unregisters mid-drag drops the card on the floor.
  */
  const latest = useRef(onDrop);
  useEffect(() => {
    latest.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return combine(
      dropTargetForElements({
        element,
        getData: () => ({ stage }),
        onDragEnter: () => setOver(true),
        onDragLeave: () => setOver(false),
        onDrop: ({ source }) => {
          setOver(false);
          const leadId = source.data.leadId;
          if (typeof leadId === "string") latest.current(leadId, stage);
        },
      }),
    );
  }, [stage]);

  return { ref, over };
}
