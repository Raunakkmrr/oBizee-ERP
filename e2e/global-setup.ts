import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Put the database in a state these tests can assert against.
 *
 * The day fixture is anchored to *today*, so it goes stale overnight — and a
 * board with no jobs on it makes every assertion here pass on an empty list,
 * which is the failure mode the contract tests were written to remove. Running
 * it here means the suite is answerable for its own preconditions rather than
 * depending on somebody having run a script this morning.
 *
 * It is additive and idempotent: the masters are only created when missing,
 * the day is replaced, and the stock ledger is append-only and cannot be
 * rebuilt at all.
 */
const API_DIR = path.resolve(process.cwd(), "../obez-erp-api");

function seed(script: string): void {
  const file = path.join(API_DIR, "src/db", script);
  if (!existsSync(file)) throw new Error(`Cannot find ${file} — is the API repo beside this one?`);

  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--env-file-if-exists=.env", `src/db/${script}`],
    { cwd: API_DIR, stdio: "inherit" },
  );
}

export default function globalSetup(): void {
  // Masters first: the day fixture hangs jobs off customers and technicians.
  seed("seed.ts");
  seed("seed-day.ts");
}
