"use client";

import { use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { PersonForm } from "@/components/people/person-form";
import { useStoreState } from "@/lib/data/use-store";
import { getState } from "@/lib/data/store";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * Edit one person.
 *
 * An unknown id renders a named 404 rather than an empty form. Falling back to
 * a blank form would silently turn "edit this person" into "create a new one",
 * which is the same class of lie as the job detail screen fabricating a record
 * for a job number it did not have.
 */
export default function EditPersonPage({
  params,
}: {
  // Next 16: params is a Promise and must be unwrapped.
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // Subscribing keeps the form honest if the directory changes underneath it.
  useStoreState();
  const person = getState().people.find((candidate) => candidate.id === id);

  if (!person) {
    const today = new Date();
    return (
      <AppShell
        role={CURRENT_USER.role}
        userName={CURRENT_USER.name}
        today={today}
        freshness={{ kind: "fresh", at: today }}
      >
        <div className="p-6">
          <h1 className="text-lg font-semibold">No person with id {id}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            They may have been removed. Open them from the people list instead.
          </p>
          <Button
            className="mt-4"
            render={<Link href="/settings?tab=people" />}
            nativeButton={false}
          >
            Back to people
          </Button>
        </div>
      </AppShell>
    );
  }

  return <PersonForm existing={person} />;
}
