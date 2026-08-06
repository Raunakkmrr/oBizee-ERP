"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserMinus, UserPlus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/shared/controls";
import { Section } from "@/components/job/sections";
import { e164 } from "@/lib/contact";
import { useDispatch } from "@/lib/data/use-store";
import { SKILLS, type Person } from "@/lib/data/people";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

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

export function PersonForm({ existing }: { existing?: Person }) {
  const dispatch = useDispatch();
  const router = useRouter();

  const [name, setName] = useState(existing?.name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState<Role>(existing?.role ?? "technician");
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [localities, setLocalities] = useState<string[]>(
    existing?.localities ?? [],
  );

  const today = new Date();
  const phoneOk = e164(phone) !== null;
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
    };

    if (existing) {
      dispatch({ type: "UPDATE_PERSON", id: existing.id, changes: fields });
    } else {
      dispatch({ type: "ADD_PERSON", person: fields });
    }
    router.push("/settings?tab=people");
  }

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/settings?tab=people" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to people
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Settings" }, { label: "People" }]}
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
                      onClick={() => setRole(option)}
                    />
                  ))}
                </div>
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
          <Button disabled={missing.length > 0} onClick={save}>
            {existing ? "Save changes" : "Add person"}
          </Button>
          <Button
            variant="outline"
            render={<Link href="/settings?tab=people" />}
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
              onClick={() => {
                dispatch({
                  type: "SET_PERSON_ACTIVE",
                  id: existing.id,
                  active: !existing.active,
                });
                router.push("/settings?tab=people");
              }}
            >
              <UserMinus className="size-4" />
              {existing.active ? "Deactivate" : "Reactivate"}
            </Button>
          ) : null}
        </div>

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
