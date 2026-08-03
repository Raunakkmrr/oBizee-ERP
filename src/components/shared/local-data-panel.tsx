"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/shared/panel";
import { cn } from "@/lib/utils";
import { useDispatch, useHydrationStatus, useStoreState } from "@/lib/data/use-store";

/**
 * Local data — what is stored, how, and how to destroy it.
 *
 * **Encryption that is not visible is indistinguishable from no encryption**, so
 * this panel states the mechanism and its limits rather than showing a padlock
 * and hoping. The honest boundary matters: AES-GCM with a non-extractable key
 * defends a *copied* storage dump. It does not defend against anything running
 * script in this page, and claiming otherwise would be theatre.
 *
 * The reset destroys the key as well as the data. Clearing `localStorage` alone
 * would leave ciphertext in backups that a retained key could still open.
 */
export function LocalDataPanel() {
  const status = useHydrationStatus();
  const state = useStoreState();
  const dispatch = useDispatch();

  const counts = [
    { one: "lead", many: "leads", n: state.leads.leads.length },
    { one: "job", many: "jobs", n: state.board.jobs.length },
    { one: "contract", many: "contracts", n: state.contracts.length },
    { one: "invoice", many: "invoices", n: state.invoices.length },
  ];

  return (
    <Panel
      title="Local data"
      icon={Lock}
      caption="Stored in this browser, encrypted at rest"
      actions={
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            status.kind === "unavailable" && "border-destructive/40 text-destructive",
            status.kind === "reset" && "text-brand-brown",
          )}
        >
          {status.kind === "hydrating"
            ? "Opening…"
            : status.kind === "ready"
              ? status.restored
                ? "Encrypted · restored"
                : "Encrypted · new"
              : status.kind === "reset"
                ? "Cleared"
                : "Not saved"}
        </Badge>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="tabular-nums text-muted-foreground">
          {counts.map((entry, index) => (
            <span key={entry.many}>
              {index > 0 ? " · " : ""}
              <span className="font-medium text-foreground">{entry.n}</span>{" "}
              {entry.n === 1 ? entry.one : entry.many}
            </span>
          ))}
        </p>

        {/* The mechanism, and its boundary, in the user's words. */}
        <p className="text-xs text-muted-foreground">
          Saved in this browser and encrypted with AES-GCM. The key is held by
          the browser itself and cannot be read out by any script, so a copied
          storage file is unreadable on another machine. It does not protect
          against someone using this browser.
        </p>

        {status.kind === "reset" || status.kind === "unavailable" ? (
          // Never silent: if stored data was discarded, or could not be written
          // at all, the person using it is told which and why.
          <p
            className={cn(
              "rounded-md p-2 text-xs",
              status.kind === "unavailable"
                ? "bg-destructive/10 text-destructive"
                : "bg-warning/15 text-brand-brown",
            )}
          >
            {status.message}
          </p>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "RESET" })}
        >
          Reset demo data
        </Button>
        <p className="text-xs text-muted-foreground">
          Destroys the stored data <em>and</em> the encryption key, then reloads
          the seed.
        </p>
      </div>
    </Panel>
  );
}
