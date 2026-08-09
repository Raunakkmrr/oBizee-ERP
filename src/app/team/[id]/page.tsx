"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { PersonForm } from "@/components/people/person-form";
import { getPeople, type Person } from "@/lib/data/people";
import { Requires } from "@/components/shared/requires";

/**
 * Edit one person.
 *
 * An unknown id renders a named 404 rather than an empty form. Falling back to
 * a blank form would silently turn "edit this person" into "create a new one",
 * which is the same class of lie as the job detail screen fabricating a record
 * for a job number it did not have.
 */
function EditPerson({
  params,
}: {
  // Next 16: params is a Promise and must be unwrapped.
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // Subscribing keeps the form honest if the directory changes underneath it.
  /*
    From the register. A person's role and whether they can still sign in are
    decided there, and a browser copy would show somebody as active after an
    owner on another machine had removed them.
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
  const person = people.find((candidate) => candidate.id === id);

  if (!person) {
    const today = new Date();
    return (
      <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
        <div className="p-6">
          <h1 className="text-lg font-semibold">No person with id {id}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            They may have been removed. Open them from the people list instead.
          </p>
          <Button
            className="mt-4"
            render={<Link href="/team" />}
            nativeButton={false}
          >
            Back to team
          </Button>
        </div>
      </AppShell>
    );
  }

  return <PersonForm existing={person} />;
}

export default function EditPersonPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Requires permission="people:manage">
      <EditPerson {...props} />
    </Requires>
  );
}
