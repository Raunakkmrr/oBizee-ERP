"use client";

import { PersonForm } from "@/components/people/person-form";
import { Requires } from "@/components/shared/requires";

export default function NewPersonPage() {
  return (
    <Requires permission="people:manage">
      <PersonForm />
    </Requires>
  );
}
