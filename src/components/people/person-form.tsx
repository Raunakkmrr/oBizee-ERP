"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/shared/controls";
import { Section } from "@/components/job/sections";
import { cn } from "@/lib/utils";
import { e164 } from "@/lib/contact";
import { useCurrentUser, useDispatch, useStoreState } from "@/lib/data/use-store";
import {
  SKILLS,
  guardDeactivate,
  guardRoleChange,
  levelsFor,
  type Guard,
  type Person,
} from "@/lib/data/people";
import { levelLabel, ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

/**
 * Add or edit a person — **a page, not a popup**, per the standing rule.
 *
 * One form for both, because "invite" and "edit" differ only in whether an id
 * exists. Two forms would drift the moment a field is added to one of them.
 *
 * **The fields that matter and why:**
 * - **Phone** is the credential (§9.4 is phone + OTP), so it is required and
 *   validated. Email is not: this market's field staff often have none, and
 *   demanding one would block a real technician from being added at all.
 * - **Skills** decide who the assignment picker will offer for a job. Left
 *   empty they mean *unknown*, not *unqualified* — `fitFor` still offers the
 *   person, flagged, rather than hiding a real human from real work.
 * - **Localities** are how a day gets clustered, so they are a hint and never
 *   a restriction.
 */

/** The localities the fixture already works in, offered as chips to save typing. */
const KNOWN_LOCALITIES = [
  "Okhla Phase II",
  "Saket",
  "Karol Bagh",
  "Vasant Kunj",
  "Greater Kailash",
  "Green Park",
  "Nehru Place",
  "Lajpat Nagar",
  "Rohini",
  "Connaught Place",
];

/** A blocked change explains itself; a warning has to be acknowledged. */
function GuardNotice({ guard }: { guard: Guard }) {
  if (guard.kind === "allow") return null;
  const blocked = guard.kind === "block";
  const Icon = blocked ? ShieldAlert : TriangleAlert;
  return (
    <div
      role={blocked ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl p-3 text-sm",
        blocked ? "bg-destructive-bg" : "bg-warning-bg",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          blocked ? "text-destructive" : "text-warning",
        )}
      />
      <p>{guard.kind === "block" ? guard.reason : guard.message}</p>
    </div>
  );
}

export function PersonForm({ existing }: { existing?: Person }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const me = useCurrentUser();
  const state = useStoreState();

  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState<Role>(existing?.role ?? "technician");
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [localities, setLocalities] = useState<string[]>(
    existing?.localities ?? [],
  );
  const [level, setLevel] = useState<string | null>(existing?.level ?? null);

  const [acknowledged, setAcknowledged] = useState(false);

  const today = new Date();
  const phoneOk = e164(phone) !== null;

  /*
    Both guards are evaluated live, so the consequence appears while the reader
    is choosing rather than after they commit.
  */
  const roleGuard: Guard = existing
    ? guardRoleChange(state.people, existing.id, role, me.id)
    : { kind: "allow" };

  const openJobsToday = existing
    ? state.board.jobs.filter(
        (job) => job.technician?.id === existing.id,
      ).length
    : 0;

  const deactivateGuard: Guard = existing
    ? guardDeactivate(state.people, existing.id, openJobsToday)
    : { kind: "allow" };

  const roleBlocked = roleGuard.kind === "block";
  // A warning must be seen before it can be passed. Reset on every change of
  // role, or an acknowledgement of one consequence would carry to another.
  const needsAck = roleGuard.kind === "warn" && !acknowledged;
  const missing = [
    name.trim() === "" ? "a name" : null,
    // Not "a phone" — the reason it is rejected is the useful half.
    phone.trim() === ""
      ? "a phone number"
      : !phoneOk
        ? "a phone number we can dial"
        : null,
  ].filter(Boolean) as string[];

  function toggle(list: string[], set: (next: string[]) => void, value: string) {
    set(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );
  }

  function save() {
    const fields = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() === "" ? null : email.trim(),
      role,
      languageOverride: existing?.languageOverride ?? null,
      active: existing?.active ?? true,
      // Only a technician can be sent anywhere, so office roles never carry
      // skills — storing them would put an accountant in the assign picker.
      skills: role === "technician" ? skills : [],
      localities: role === "technician" ? localities : [],
      // Kept where the role has a ladder; cleared where it does not, so a
      // level can never survive a change of department.
      level: levelsFor(role).includes(level ?? "") ? level : null,
    };

    if (existing) {
      dispatch({ type: "UPDATE_PERSON", id: existing.id, changes: fields });
    } else {
      dispatch({ type: "ADD_PERSON", person: fields });
    }
    router.push("/team");
  }

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/team" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to team
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Team" }]}
          className="mb-4"
          title={existing ? existing.name : "Add a person"}
          description={
            existing
              ? "Changes take effect on the board immediately."
              : "They can sign in with this phone number and an OTP."
          }
        />

        <div className="grid max-w-4xl items-start gap-3 lg:grid-cols-2">
          <Section title="Who they are" icon={UserPlus} tone="place">
            <div className="space-y-3 text-sm">
              <div>
                <label htmlFor="name" className="mb-1.5 block font-medium">
                  Name
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ramesh Yadav"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1.5 block font-medium">
                  Phone
                </label>
                <Input
                  id="phone"
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98110 00003"
                  aria-invalid={phone.trim() !== "" && !phoneOk}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {/* §9.4: phone + OTP is the main sign-in, so this is the
                      credential rather than a contact detail. */}
                  This is how they sign in — a ten-digit Indian mobile.
                </p>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block font-medium">
                  Email <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Leave blank for field staff"
                />
              </div>

              <div>
                <p className="mb-1.5 font-medium">Role</p>
                <div className="flex flex-wrap gap-1.5">
                  {ROLES.map((option) => (
                    <Chip
                      key={option}
                      label={ROLE_LABELS[option]}
                      selected={role === option}
                      onClick={() => {
                        setRole(option);
                        setAcknowledged(false);
                        // A level belongs to its role; carrying one across
                        // departments would silently mis-grant.
                        setLevel(null);
                      }}
                    />
                  ))}
                </div>
                <div className="mt-2 empty:hidden">
                  <GuardNotice guard={roleGuard} />
                </div>
                {/*
                  The level question, asked *inside* the role rather than by
                  offering more roles. Only shown where the role has a ladder.
                */}
                {levelsFor(role).length > 0 ? (
                  <div className="mt-3">
                    <label htmlFor="level" className="mb-1.5 block font-medium">
                      Level
                    </label>
                    <select
                      id="level"
                      value={level ?? ""}
                      onChange={(event) =>
                        setLevel(event.target.value || null)
                      }
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Not set</option>
                      {levelsFor(role).map((option) => (
                        <option key={option} value={option}>
                          {levelLabel(role, option)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {role === "marketing"
                        ? "Only the senior level may put a price in front of a customer."
                        : "Decides who the board recommends, and who it will not send alone to a breakdown."}
                    </p>
                  </div>
                ) : null}

                {roleGuard.kind === "warn" ? (
                  <label className="mt-2 flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-primary)]"
                    />
                    I understand I will lose access to Settings.
                  </label>
                ) : null}
              </div>
            </div>
          </Section>

          {/*
            Only a technician has anywhere to be sent, so the whole panel is
            withheld for office roles rather than shown greyed — an accountant
            with a skills picker is a question nobody should have to answer.
          */}
          {role === "technician" ? (
            <Section title="What they can be sent to" icon={UserPlus} tone="machine">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-1.5 font-medium">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILLS.map((skill) => (
                      <Chip
                        key={skill}
                        label={skill}
                        selected={skills.includes(skill)}
                        onClick={() => toggle(skills, setSkills, skill)}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Decides who the board offers for a job. Left empty they are
                    still offered, marked “no skills recorded” — never hidden.
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 font-medium">Areas they cover</p>
                  <div className="flex flex-wrap gap-1.5">
                    {KNOWN_LOCALITIES.map((place) => (
                      <Chip
                        key={place}
                        label={place}
                        selected={localities.includes(place)}
                        onClick={() => toggle(localities, setLocalities, place)}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    A hint for clustering the day, never a restriction — anyone
                    can still be sent anywhere.
                  </p>
                </div>
              </div>
            </Section>
          ) : null}
        </div>

        <div className="mt-4 flex max-w-4xl flex-wrap items-center gap-2">
          <Button
            disabled={missing.length > 0 || roleBlocked || needsAck}
            onClick={save}
          >
            {existing ? "Save changes" : "Add person"}
          </Button>
          <Button
            variant="outline"
            render={<Link href="/team" />}
            nativeButton={false}
          >
            Cancel
          </Button>

          {missing.length > 0 ? (
            // Names what is missing rather than just disabling — a dead button
            // with no explanation is the thing this whole pass removed.
            <p className="text-xs text-muted-foreground">
              Still needs {missing.join(" and ")}.
            </p>
          ) : null}

          {existing ? (
            <Button
              variant="outline"
              className="ml-auto"
              disabled={existing.active && deactivateGuard.kind === "block"}
              onClick={() => {
                dispatch({
                  type: "SET_PERSON_ACTIVE",
                  id: existing.id,
                  active: !existing.active,
                });
                router.push("/team");
              }}
            >
              <UserMinus className="size-4" />
              {existing.active ? "Deactivate" : "Reactivate"}
            </Button>
          ) : null}
        </div>

        {/*
          Shown beside the button rather than behind a confirm dialog: the
          consequence is a fact about today's board, and the reader should be
          able to go and fix it instead of being asked to accept it blind.
        */}
        {existing?.active ? (
          <div className="mt-3 max-w-4xl empty:hidden">
            <GuardNotice guard={deactivateGuard} />
          </div>
        ) : null}

        {existing ? (
          <p className="mt-2 max-w-4xl text-xs text-muted-foreground">
            {/* Explains the absence of a Delete, so it does not read as missing. */}
            People are deactivated, never deleted — they still own the history of
            every job they closed.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
