"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useSessionResolved } from "@/lib/data/use-session";
import { loadCaller, sessionLoadFailure, subscribeToSession } from "@/lib/api/session";
import { signOut } from "@/lib/api/client";
import { ROLE_LABELS } from "@/lib/roles";

/** Only /api/me supplies identity; no shell, fixture, business metrics or role switches. */
export default function AccountCheckpoint() {
  const me = useCurrentUser();
  const resolved = useSessionResolved();
  const failure = useSyncExternalStore(subscribeToSession, sessionLoadFailure, () => null);
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (resolved && !me && !failure) router.replace("/sign-in");
  }, [resolved, me, failure, router]);

  async function leave() {
    setLeaving(true);
    await signOut();
    router.replace("/sign-in");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-sm sm:p-10" aria-labelledby="account-title">
        <p className="text-sm font-semibold text-muted-foreground">oBizee · Service ERP</p>
        <h1 id="account-title" className="mt-5 text-2xl font-semibold tracking-tight">Company account connection</h1>
        {!me ? (
          <div className="mt-5" role={failure ? "alert" : "status"}>
            <p>{failure ? "Your account could not be verified. Check the connection and try again." : "Checking your company account…"}</p>
            {failure ? <Button className="mt-4" variant="outline" onClick={() => void loadCaller()}>Try again</Button> : null}
          </div>
        ) : (
          <>
            <p className="mt-5 flex items-center gap-2 text-sm font-medium"><ShieldCheck size={19} aria-hidden="true" />Your company ERP identity is confirmed.</p>
            <dl className="mt-6 grid gap-4 rounded-xl border bg-background p-5 text-sm">
              <div><dt className="text-muted-foreground">Name</dt><dd className="mt-1 font-medium">{me.name}</dd></div>
              <div><dt className="text-muted-foreground">Company account ID</dt><dd className="mt-1 break-all font-medium">{me.tenantId}</dd></div>
              <div><dt className="text-muted-foreground">Role</dt><dd className="mt-1 font-medium">{ROLE_LABELS[me.role]}</dd></div>
            </dl>
            <div className="mt-6 text-sm leading-relaxed text-muted-foreground">
              <p>This release confirms sign-in and session continuity only. The operational workspace is not available here yet. No sample company activity is shown.</p>
              <p className="mt-3">These are your company ERP credentials, not an oBizee Admin account.</p>
              {me.mustChangePassword ? <p className="mt-3" role="alert">Your account requires a password change. Password changes are not available in this connection checkpoint; contact your company owner for assistance.</p> : null}
            </div>
            <Button className="mt-6" variant="outline" disabled={leaving} onClick={() => void leave()}><LogOut size={16} aria-hidden="true" />{leaving ? "Signing out…" : "Sign out"}</Button>
          </>
        )}
      </section>
    </main>
  );
}
