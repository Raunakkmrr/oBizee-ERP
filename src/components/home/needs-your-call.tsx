import Link from "next/link";
import { Banknote, CircleAlert, PackageOpen, PhoneMissed, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import type { AttentionItem, HomeSnapshot } from "@/lib/data/home";

/**
 * Beat 2 — **what needs me**.
 *
 * The one decision: *what is stuck, and what do I do about it?*
 *
 * A **queue with an action per row, not a feed**. Three rules make it a queue:
 *
 * 1. Every row is a **sentence naming the person and the consequence**, because
 *    "SLA breach ×1" is not actionable at 9am.
 * 2. Every row ends in **one labelled button** — no kebab menu, no hover-reveal.
 *    §2.2 lists hidden navigation as a non-goal: it "reads as a missing feature
 *    to this user base".
 * 3. Rows arrive pre-sorted by severity. The owner reads top-down and stops when
 *    he runs out of time, so the ordering is the product's judgement, not his.
 *
 * §6.13.4's channel rule: severity is carried by **position and wording**, not
 * by hue intensity — "severity is encoded by position and wording, not by hue".
 * The icon supplies a second non-colour channel.
 */

const KIND_ICON = {
  bad_rating: Star,
  lead_missed_followups: PhoneMissed,
  parts_awaited_stalled: PackageOpen,
  sla_breach: CircleAlert,
  unsettled_cash: Banknote,
} as const;

function AttentionRow({
  item,
  primary,
}: {
  item: AttentionItem;
  /**
   * True for the first row only. §6.13.2 expects exactly one primary-styled
   * button per screen — this screen had none, so nothing told a hurried owner
   * where to start. Rows arrive pre-sorted by severity, so the first row is by
   * construction the one to act on.
   */
  primary: boolean;
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <Icon aria-hidden="true" className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent>
        {/*
          `line-clamp-1` is Item's default on the title. Overridden: these are
          sentences, and a clipped sentence loses the consequence — which is the
          only part that makes the row actionable.
        */}
        <ItemTitle className="line-clamp-none">{item.sentence}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {item.detail}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant={primary ? "default" : "outline"}
          size="sm"
          render={<Link href={item.href} />}
          nativeButton={false}
        >
          {item.actionLabel}
        </Button>
      </ItemActions>
    </Item>
  );
}

export function NeedsYourCall({
  attention,
  comingUp,
}: {
  attention: HomeSnapshot["attention"];
  comingUp: HomeSnapshot["comingUp"];
}) {
  return (
    <Card
      // Gate 6 rework, Background dimension. This is the only block on the
      // screen that produces an *action*; the other three report. Rendered flat
      // like its neighbours it carried no more weight than a summary, so the
      // hierarchy the screen claims did not exist visually.
      //
      // Depth is used structurally, not decoratively (Gate 2): a raised surface
      // plus a brand-coloured left edge. The left edge is also a **shape**
      // channel, so the distinction survives greyscale and a washed-out panel —
      // which matters more under DR-13, where contrast is lower than §9.6 asks.
      className="border-l-4 border-l-primary shadow-md"
    >
      <CardHeader>
        <CardTitle>
          Needs your call
          {attention.length > 0 ? (
            // The count is part of the title, not a decorative badge: it tells
            // the owner how much is waiting before he reads a single row.
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {attention.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attention.length === 0 ? (
          // §6.3's three parts. The orientation line points at the next real
          // thing rather than congratulating — an empty queue at 9am means the
          // work is elsewhere, not that the day is done.
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Nothing needs you right now.</EmptyTitle>
              <EmptyDescription>
                {comingUp.tomorrowJobs} jobs scheduled for tomorrow,{" "}
                {comingUp.tomorrowUnassigned} still unassigned.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button render={<Link href="/today" />} nativeButton={false}>
                See today&apos;s board
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {attention.map((item, index) => (
              <AttentionRow key={item.id} item={item} primary={index === 0} />
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
