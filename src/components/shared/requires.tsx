"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/data/use-store";
import { can, ROLE_LABELS, type Permission } from "@/lib/roles";

/**
 * A route that only some roles may open.
 *
 * **Why this had to exist.** People management shipped with no permission check
 * of any kind. §6.2 keeps Settings out of a coordinator\'s *navigation*, and
 * that was mistaken for authorisation — but hiding a link is not a permission.
 * Anyone who typed `/settings/people/new` got the full form, including the
 * ability to add an owner. A gate that only removes a menu item is decoration.
 *
 * The refusal names the permission and the current role rather than saying
 * "forbidden", because the person reading it is usually a real colleague who
 * needs to know who to ask.
 */
export function Requires({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const me = useCurrentUser();
  if (can(me.role, permission)) return <>{children}</>;

  const today = new Date();
  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-6">
        <div className="max-w-lg rounded-xl bg-card p-6 shadow-[var(--shadow-card)]">
          <span className="grid size-10 place-items-center rounded-xl bg-destructive-bg text-destructive">
            <ShieldAlert className="size-5" />
          </span>
          <h1 className="mt-3 text-lg font-semibold">
            {ROLE_LABELS[me.role]} cannot open this
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This screen needs the{" "}
            <span className="font-mono text-xs">{permission}</span> permission.
            You are signed in as {me.name}. An owner can change this, or switch
            user from the top bar.
          </p>
          <Button className="mt-4" render={<Link href="/today" />} nativeButton={false}>
            Back to today
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
