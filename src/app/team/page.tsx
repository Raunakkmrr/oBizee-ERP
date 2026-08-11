"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Requires } from "@/components/shared/requires";
import { Input } from "@/components/ui/input";
import { Chip as FilterChip } from "@/components/shared/controls";
import { cn } from "@/lib/utils";
import { getPeople, matchesQuery, type Person } from "@/lib/data/people";
import { levelLabel, ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

/**
 * Team — the people who work here.
 *
 * **Its own destination, not a Settings tab.** A growing service firm hires far
 * more often than it changes its GST scheme, and burying the weekly act under
 * the twice-a-year one is backwards. Settings keeps configuration; this keeps
 * humans.
 *
 * The roles below the office are the ones a service company actually runs
 * (see `ROLES`): a support desk that answers and reports, a telecaller that
 * qualifies new enquiries, and an estimator who quotes and visits. Grade is
 * shown beside the role because it is the other half of the answer to "who can
 * I send" — and is deliberately *not* a permission.
 */
const SURFACE =
  "rounded-2xl bg-card shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]";

/**
 * The directory.
 *
 * **Two things were wrong here.** `Invite person` and `Edit` were raw `<button>`
 * elements with no handler — dead controls over a hardcoded fixture, so there
 * was no way to add or change a person at all. And every person was rendered as
 * a card in a grid, which is fine for seven and unusable at fifty: no search,
 * no filter, nothing to type at.
 *
 * Now it reads the store, filters as you type, and both controls go to a real
 * page (forms are pages here, never popups).
 */
function Team() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [showLeavers, setShowLeavers] = useState(false);
  /*
    From the register. This screen decides who can sign in, so reading a local
    copy would show one machine's idea of the team while another had already
    changed it — and the person missing from the list is the one whose access
    somebody meant to remove.
  */
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getPeople().then((result) => {
      if (!cancelled && result.status === "ready") setPeople([...result.data.people]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
    **Deactivated people are out of the way, not gone.**

    The list showed everyone who had ever had a login. On the development
    tenant that is ninety-seven disabled accounts in front of thirteen real
    ones — you scroll past `Leaver 2601120995` to reach your own technician.
    It is not only a fixture problem: a firm five years old has more leavers
    than staff, and this screen answers "who works here", which is a question
    about the present tense.

    Hidden rather than removed, because the leavers still matter — restoring
    access, and seeing that somebody's login really was revoked, both start
    here. The count beside the toggle is what stops it being a hiding place.
  */
  const deactivated = people.filter((person) => !person.active).length;
  const visible = people.filter(
    (person) =>
      (showLeavers || person.active) &&
      (role === null || person.role === role) &&
      matchesQuery(person, query),
  );
  const active = people.filter((person) => person.active).length;
  const technicians = people.filter(
    (person) => person.role === "technician" && person.active,
  ).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {active}
          </span>{" "}
          people can sign in ·{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {technicians}
          </span>{" "}
          technicians on the strength
        </p>
        <Link
          href="/team/new"
          className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-raised)] transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <UserPlus className="size-4" />
          Add person
        </Link>
      </div>

      {/* Search first, because at fifty people scanning is not an option. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, skill or area"
          aria-label="Search people"
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="Everyone"
            selected={role === null}
            onClick={() => setRole(null)}
          />
          {ROLES.map((option) => (
            <FilterChip
              key={option}
              label={ROLE_LABELS[option]}
              selected={role === option}
              onClick={() => setRole(role === option ? null : option)}
            />
          ))}
        </div>

        {deactivated > 0 ? (
          <FilterChip
            label={`Deactivated (${deactivated})`}
            selected={showLeavers}
            onClick={() => setShowLeavers((previous) => !previous)}
          />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className={cn(SURFACE, "p-6 text-sm text-muted-foreground")}>
          Nobody matches “{query}”
          {role ? ` in ${ROLE_LABELS[role]}` : ""}.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((user) => (
          <div
            key={user.id}
            className={cn(SURFACE, "p-5", !user.active && "opacity-60 hover:opacity-100")}
          >
            <div className="flex items-start gap-3.5">
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl text-sm font-semibold",
                  user.active
                    ? "bg-primary-bg text-primary-text"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {user.name
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {user.name}
                </p>
                {/* §7.3: phone is the login identity in this market. */}
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {user.phone}
                </p>
                {user.skills.length > 0 ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {user.skills.join(" · ")}
                  </p>
                ) : user.role === "technician" ? (
                  // Visible, because it is what makes the assign picker flag
                  // him — and the fix is one click away.
                  <p className="mt-0.5 truncate text-xs text-brand-brown">
                    No skills recorded
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary-bg px-2.5 py-1 text-xs font-medium text-primary-text">
                {ROLE_LABELS[user.role as Role]}
              </span>
              {user.level ? (
                // Beside the role, never instead of it — the tag says which
                // department, the level says where inside it.
                <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {levelLabel(user.role, user.level)}
                </span>
              ) : null}
              {user.languageOverride ? (
                // FR-1304: a per-user override of the tenant default.
                <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground uppercase">
                  {user.languageOverride}
                </span>
              ) : null}
              {!user.active ? (
                <span className="rounded-lg bg-destructive-bg px-2.5 py-1 text-xs font-medium text-destructive">
                  Disabled
                </span>
              ) : null}
              <Link
                href={`/team/${user.id}`}
                className="ml-auto rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                {user.active ? "Edit" : "Restore"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const today = new Date();
  return (
    <Requires permission="people:manage">
      <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
        <div className="p-4 md:p-6">
          <PageHeader
            breadcrumb={[{ label: "Team" }]}
            className="mb-4"
            title="Team"
            description="Who works here, what they can be sent to, and how senior they are."
          />
          <Team />
        </div>
      </AppShell>
    </Requires>
  );
}
