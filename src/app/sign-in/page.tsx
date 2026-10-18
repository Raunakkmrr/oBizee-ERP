"use client";

import { useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, ClipboardList, Eye, EyeOff, Loader2, ReceiptText, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithPassword } from "@/lib/api/client";
import { sessionEndedNotice } from "@/lib/api/session";
import { colors } from "@/lib/design/tokens";
import styles from "./page.module.css";

// The public sign-in keeps the dashboard's light brand canvas in either theme.
const signInPalette = {
  "--auth-bg": colors.bgWarm, "--auth-ink": colors.textPrimary,
  "--auth-muted": colors.textSecondary, "--auth-brown": colors.brownDeep,
  "--auth-accent": colors.primaryDark, "--auth-peach": colors.peach,
  "--auth-border": colors.inputBorder, "--auth-surface": colors.surface,
} as CSSProperties;

/** Password is the approved launch path; phone-code delivery is not configured. */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sessionNotice = useSyncExternalStore(() => () => {}, sessionEndedNotice, () => null);

  async function finish(run: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(true);
    setProblem(null);
    try {
      const result = await run();
      if (result.ok) router.push("/");
      else setProblem(result.message);
    } catch {
      setProblem("Cannot reach the sign-in service right now. Check your connection and try again; your local drafts are unchanged.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || email.trim() === "" || password === "") return;
    void finish(() => signInWithPassword(email.trim().toLowerCase(), password));
  }

  return (
    <main className={styles.page} style={signInPalette}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <Image src="/brand/obizee-mark.svg" alt="" aria-hidden="true" width={52} height={52} priority unoptimized />
          <span><span>oBizee</span><span>Service ERP</span></span>
        </span>
      </header>

      <div className={styles.frame}>
        <section className={styles.welcome} aria-labelledby="sign-in-title">
          <h1 id="sign-in-title" className={styles.title}>Welcome<br />back<span>.</span></h1>
          <p className={styles.intro}>Your company&apos;s service work, in one place.</p>
          <div className={styles.features}>
            <p className={styles.eyebrow}>Inside your company workspace</p>
            <ul className={styles.featureList}>
              <li><span className={styles.featureIcon}><ClipboardList aria-hidden="true" size={19} /></span>Enquiries, customers and service jobs</li>
              <li><span className={styles.featureIcon}><UsersRound aria-hidden="true" size={19} /></span>Teams, branches and fieldwork</li>
              <li><span className={styles.featureIcon}><ReceiptText aria-hidden="true" size={19} /></span>Invoices, collections and reports</li>
            </ul>
          </div>
        </section>

        <section className={styles.entry} aria-labelledby="form-title">
          <h2 id="form-title" className={styles.formHeading}>Sign in to Service ERP</h2>
          <p className={styles.formIntro}>Use the account issued by your company.</p>
          <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
            {sessionNotice ? <p role="status" className={styles.notice}>{sessionNotice}</p> : null}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="staff-email">Work email</label>
              <Input
                id="staff-email"
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="staff-password">Password</label>
              <div className={styles.passwordWrap}>
                <Input
                  id="staff-password"
                  className={[styles.input, styles.passwordInput].join(" ")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                  required
                />
                <button
                  className={styles.visibility}
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={busy}
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                </button>
              </div>
            </div>

            <Button className={styles.submit} type="submit" disabled={busy || email.trim() === "" || password === ""}>
              {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {busy ? "Signing in…" : "Sign in"}
              {!busy ? <ArrowRight aria-hidden="true" className="ml-1 size-4" /> : null}
            </Button>
            {problem ? (
              // Unknown address and wrong password use the same API message.
              <p role="alert" className={styles.problem}>{problem}</p>
            ) : null}

            <p className={styles.accountNote}><ShieldCheck aria-hidden="true" size={16} /><span>For company accounts. oBizee Admin has a separate sign-in.</span></p>
            <div className={styles.recovery}>
              <p>Need access or forgot your password?</p>
              <p>Ask your company owner for help.</p>
            </div>
          </form>
        </section>
      </div>

      <footer className={styles.footer}>
        <p>Powered by oBizee</p>
        <p>Service ERP <span aria-hidden="true">·</span> Authorised company staff only</p>
      </footer>
    </main>
  );
}
