import {
  GST_STATES,
  guessStateFromPin,
  isValidPin,
  STATE_BY_CODE,
} from "./pincode";

/**
 * PIN → city and state, over the network, degrading to the offline guess.
 *
 * **The external service.** `api.postalpincode.in` is a free, community-run
 * mirror of India Post's directory. No key, no signup — and no SLA, which is
 * the fact that shapes this module. It is treated as an *enrichment*: the form
 * works when it is down, when the laptop is on a hotspot in a basement, and
 * when it returns something odd. Every path ends at fields a human can type.
 *
 * Per the project's own rule for external calls: a timeout, one retry with
 * backoff, and a breaker that stops asking after repeated failure so a dead
 * endpoint does not add three seconds to every keystroke for the rest of the
 * session.
 */

const ENDPOINT = "https://api.postalpincode.in/pincode";
const TIMEOUT_MS = 4000;
const RETRIES = 1;
/** After this many consecutive failures the session stops calling out. */
const BREAKER_THRESHOLD = 3;

let consecutiveFailures = 0;

export function breakerOpen(): boolean {
  return consecutiveFailures >= BREAKER_THRESHOLD;
}

/** Test seam, and the control behind "try again" in the UI. */
export function resetBreaker(): void {
  consecutiveFailures = 0;
}

export type PinResult =
  | {
      kind: "found";
      /** Where the answer came from, so the UI never implies more than it knows. */
      via: "postal_api";
      city: string;
      district: string;
      stateName: string;
      stateCode: string | null;
      localities: string[];
    }
  | {
      kind: "guessed";
      via: "offline_prefix";
      stateName: string;
      stateCode: string;
      reason: string;
    }
  | { kind: "unavailable"; reason: string }
  | { kind: "invalid"; reason: string };

type PostalOffice = {
  Name?: unknown;
  District?: unknown;
  State?: unknown;
  Block?: unknown;
};

export async function lookupPin(
  pin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PinResult> {
  const digits = pin.replace(/\D/g, "");
  if (!isValidPin(digits)) {
    return { kind: "invalid", reason: "A PIN code is six digits, starting 1–8" };
  }

  if (!breakerOpen()) {
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      try {
        const offices = await callOnce(digits, fetchImpl);
        if (offices !== null && offices.length > 0) {
          consecutiveFailures = 0;
          return fromOffices(offices);
        }
        // A valid response saying "no records" is an answer, not a failure —
        // retrying it would just be slower.
        if (offices !== null) break;
      } catch {
        // Swallowed deliberately: the caller gets a typed result, and a
        // network hiccup is not an exception the form should handle.
      }
      if (attempt < RETRIES) {
        await sleep(250 * (attempt + 1));
      }
    }
    consecutiveFailures += 1;
  }

  return fallback(digits);
}

async function callOnce(
  pin: string,
  fetchImpl: typeof fetch,
): Promise<PostalOffice[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${ENDPOINT}/${pin}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length === 0) return null;
    const first = body[0] as { Status?: unknown; PostOffice?: unknown };
    if (first.Status !== "Success" || !Array.isArray(first.PostOffice)) {
      // "No records found" arrives with HTTP 200, so the status field is the
      // only thing that distinguishes a real answer from an empty one.
      return [];
    }
    return first.PostOffice as PostalOffice[];
  } finally {
    clearTimeout(timer);
  }
}

function fromOffices(offices: PostalOffice[]): PinResult {
  const first = offices[0];
  const stateName = str(first.State);
  const district = str(first.District);

  return {
    kind: "found",
    via: "postal_api",
    // The district is the city for most of India; the post-office name is the
    // locality, which is the more useful of the two on a job sheet.
    city: district,
    district,
    stateName,
    stateCode: codeForStateName(stateName),
    // Offered as suggestions for the locality field — a PIN covers several,
    // and picking one beats typing it.
    localities: [...new Set(offices.map((office) => str(office.Name)))]
      .filter((name) => name !== "")
      .slice(0, 12),
  };
}

function fallback(pin: string): PinResult {
  const guess = guessStateFromPin(pin);
  if (guess.kind === "state") {
    return {
      kind: "guessed",
      via: "offline_prefix",
      stateName: guess.name,
      stateCode: guess.code,
      reason: "Worked out from the PIN's prefix — check it before saving",
    };
  }
  return {
    kind: "unavailable",
    reason:
      guess.kind === "ambiguous"
        ? guess.reason
        : "Could not look this PIN up — enter the city and state",
  };
}

/**
 * Match India Post's state spelling to a GST code.
 *
 * Loose on purpose: the directory writes "Orissa" and "Pondicherry" in places,
 * and a state we cannot code is not a failure — it is a state the reader
 * picks, with the city already filled in.
 */
function codeForStateName(name: string): string | null {
  const normalised = normalise(name);
  if (normalised === "") return null;

  const ALIASES: Record<string, string> = {
    orissa: "21",
    pondicherry: "34",
    uttaranchal: "05",
    "nct of delhi": "07",
    "delhi nct": "07",
  };
  if (ALIASES[normalised]) return ALIASES[normalised];

  const direct = GST_STATES.find((entry) => normalise(entry.name) === normalised);
  if (direct) return direct.code;

  const partial = GST_STATES.find(
    (entry) =>
      !entry.obsolete &&
      (normalise(entry.name).includes(normalised) ||
        normalised.includes(normalise(entry.name))),
  );
  return partial?.code ?? null;
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** For the UI's "we know this state as…" line. */
export function stateNameFor(code: string | null): string | null {
  return code ? (STATE_BY_CODE[code] ?? null) : null;
}
