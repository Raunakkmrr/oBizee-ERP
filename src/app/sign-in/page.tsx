"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/shared/field";
import { Chip } from "@/components/shared/controls";
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import {
  requestOtp,
  signInWithOtp,
  signInWithPassword,
} from "@/lib/api/client";

/**
 * Signing in — the two doors, side by side.
 *
 * Field staff have a phone and often no work email; the office has an email and
 * a password. Making one of them the default and the other a link buries half
 * the workforce, so both are offered and the reader picks.
 *
 * The phone route is first because the technicians outnumber the office in
 * every tenant this product is for.
 */
export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setProblem(null);
    await requestOtp(phone);
    // Always advances, whatever the number. The API deliberately does not say
    // whether it exists, and neither does this.
    setSent(true);
    setBusy(false);
  }

  async function finish(run: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(true);
    setProblem(null);
    const result = await run();
    setBusy(false);
    if (result.ok) router.push("/today");
    else setProblem(result.message);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
            oB
          </span>
          <div>
            <p className="text-lg font-semibold tracking-tight">oBizee</p>
            <p className="text-sm text-muted-foreground">
              {SEED_TENANT.businessName} · Service ERP
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label="Phone"
                selected={mode === "phone"}
                onClick={() => { setMode("phone"); setProblem(null); }}
              />
              <Chip
                label="Email"
                selected={mode === "email"}
                onClick={() => { setMode("email"); setProblem(null); }}
              />
            </div>

            {mode === "phone" ? (
              <>
                <Field
                  label="Phone"
                  type="tel"
                  inputMode="numeric"
                  className="tabular-nums"
                  placeholder="10 digits"
                  value={phone}
                  onChange={setPhone}
                  hint="+91 assumed"
                />
                {sent ? (
                  <Field
                    label="The code we sent"
                    inputMode="numeric"
                    className="tabular-nums tracking-[0.3em]"
                    placeholder="6 digits"
                    value={code}
                    onChange={(next) => setCode(next.replace(/\D/g, "").slice(0, 6))}
                  />
                ) : null}
                <Button
                  className="w-full"
                  disabled={busy || (sent ? code.length !== 6 : phone.trim().length < 10)}
                  onClick={() => (sent ? finish(() => signInWithOtp(phone, code)) : send())}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}
                  {sent ? "Sign in" : "Send me a code"}
                </Button>
                {sent ? (
                  <button
                    type="button"
                    className="w-full text-xs text-muted-foreground underline"
                    onClick={() => { setSent(false); setCode(""); }}
                  >
                    Use a different number
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <Field
                  label="Email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={setEmail}
                />
                <Field
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                />
                <Button
                  className="w-full"
                  disabled={busy || email.trim() === "" || password === ""}
                  onClick={() => finish(() => signInWithPassword(email.trim().toLowerCase(), password))}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  Sign in
                </Button>
              </>
            )}

            {problem ? (
              // One message for a wrong password and an unknown address, because
              // the API gives one — telling them apart is a free directory.
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Field staff sign in with a phone. The office uses an email.
        </p>
      </div>
    </main>
  );
}
