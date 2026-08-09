"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { changePassword } from "@/lib/api/client";
import { getCaller } from "@/lib/api/session";

/**
 * Replace a password somebody else chose.
 *
 * **Why this screen has no navigation.** The register refuses every other
 * request while this is outstanding, so a shell around it would render a
 * sidebar whose every link answers 403. A door with one thing behind it should
 * look like one.
 *
 * The current password is asked for even though the reader is already signed
 * in: a borrowed unlocked laptop should not be enough to take over an account.
 * It is also the last time that password is any use, which is the point.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nobody signed in has nothing to change.
  useEffect(() => {
    if (!getCaller()) router.replace("/sign-in");
  }, [router]);

  /*
    Ten characters and no composition rule. "One uppercase, one digit, one
    symbol" reliably produces Password@1 — a rule that makes passwords worse
    while feeling stricter. Length is the part that helps.
  */
  const longEnough = next.length >= 10;
  const matches = next === confirm;
  const ready = current.length > 0 && longEnough && matches && !busy;

  async function submit() {
    setBusy(true);
    setProblem(null);
    const result = await changePassword(current, next);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    router.replace("/today");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="grid size-11 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
        oB
      </div>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        Choose your own password
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The one you were given was chosen by somebody else, so it is a shared
        secret until you replace it. Nothing else opens until you do.
      </p>

      <div className="mt-5 space-y-3">
        <Field
          label="The password you were given"
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
        />
        <Field
          label="Your new password"
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint="At least ten characters. A phrase you can remember beats a short one you cannot."
          error={next.length > 0 && !longEnough ? "Ten characters or more" : undefined}
        />
        <Field
          label="Type it again"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={confirm.length > 0 && !matches ? "These two do not match" : undefined}
        />

        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : null}

        <Button className="w-full" disabled={!ready} onClick={() => void submit()}>
          {busy ? "Saving…" : "Save and carry on"}
        </Button>
      </div>
    </main>
  );
}
