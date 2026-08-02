/**
 * Dates, times and the Indian financial year — PRD §9.7.
 *
 * India only, INR only, **IST only, no timezone selector** (§2.2 non-goals,
 * §9.7). Every formatter here pins `Asia/Kolkata` explicitly rather than relying
 * on the runtime's local zone, because the server, the CI runner and a developer
 * laptop will all disagree — and a job timestamp that shifts by five and a half
 * hours depending on where it was rendered is a dispute nobody can resolve.
 *
 * The offline architecture makes this sharper still: §9.2 requires that reports
 * use `occurred_at` (the technician's device clock, with recorded skew) rather
 * than `synced_at`. A technician who finished at 4pm in a basement and synced at
 * 7pm did the job at 4pm. So these formatters must render a moment faithfully in
 * IST regardless of where the rendering happens.
 */

const IST = "Asia/Kolkata";

/** `31/07/2026` — the everyday form (§9.7). */
const dateNumeric = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** `31 Jul 2026` — used where a numeric date could be misread as US order. */
const dateLong = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** `31 Jul` — for same-year contexts such as a job timeline. */
const dateShort = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
});

/** 12-hour with am/pm (§9.7). */
const timeOfDay = new Intl.DateTimeFormat("en-US", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Parts accessor for the FY calculation, which must be done in IST. */
const istParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(value: Date): string {
  return dateNumeric.format(value);
}

export function formatDateLong(value: Date): string {
  return dateLong.format(value);
}

export function formatDateShort(value: Date): string {
  return dateShort.format(value);
}

/**
 * `12:15 am`. Lower-cased because §9.7 specifies "12-hour with am/pm" and ICU
 * emits "AM"; the narrow no-break space ICU inserts is normalised to a plain
 * space so the string is safe to search and to place in a WhatsApp body.
 */
export function formatTime(value: Date): string {
  return timeOfDay
    .format(value)
    .replace(/ /g, " ")
    .replace(/\bAM\b/, "am")
    .replace(/\bPM\b/, "pm");
}

/** `31 Jul 2026, 12:15 am` — a full moment, for timelines and audit rows. */
export function formatDateTime(value: Date): string {
  return `${formatDateLong(value)}, ${formatTime(value)}`;
}

/** Hour of day in IST, 0–23. */
function istHour(value: Date): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    hour12: false,
  }).format(value);
  // en-GB renders midnight as "24" in some ICU versions; normalise it.
  return Number(formatted) % 24;
}

/**
 * Time-of-day greeting, resolved **in IST**.
 *
 * A hardcoded "Good morning" is a small lie that undermines a screen whose
 * whole claim is that its numbers are trustworthy — and the coordinator covering
 * a Sunday evening shift sees it at 8pm. Resolved in IST rather than the
 * browser's zone for the same reason every other formatter here is (§9.7).
 *
 * Boundaries follow Indian working-day convention rather than a clock split:
 * the morning shift starts at 9 (§11-Q15's assumed slots), so 5am–11:59am is
 * morning, noon–4:59pm afternoon, and the rest evening.
 */
export function greetingFor(value: Date): string {
  const hour = istHour(value);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The IST calendar date parts for a moment. */
function istYearMonthDay(value: Date): {
  year: number;
  month: number;
  day: number;
} {
  // en-CA yields YYYY-MM-DD, which is unambiguous to split.
  const [year, month, day] = istParts.format(value).split("-").map(Number);
  return { year, month, day };
}

/**
 * The Indian financial year containing a moment, rendered `2026-27` (§9.7).
 *
 * The FY runs 1 April to 31 March, so anything in January–March belongs to the
 * FY that started in the *previous* calendar year. This matters well beyond
 * display: FR-811 resets statutory invoice numbering per financial year with the
 * year in the series (`SVC/26-27/0148`), and FR-803 re-evaluates the tenant's
 * HSN/SAC digit precision at each FY rollover. Getting the boundary wrong
 * produces a duplicate invoice number, which is a statutory defect rather than a
 * cosmetic one.
 */
export function financialYear(value: Date): string {
  const { year, month } = istYearMonthDay(value);
  const startYear = month >= 4 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endShort}`;
}

/** The FY label in the compact form used inside document series: `26-27`. */
export function financialYearShort(value: Date): string {
  return financialYear(value).slice(2);
}

/**
 * A relative day label for list grouping — the vocabulary §6.6 uses for the lead
 * follow-up queue's groups (Overdue → Today → Tomorrow → This week → Later).
 *
 * Comparison is on IST calendar dates, not on elapsed milliseconds: at 00:30 IST
 * a job scheduled for "today" is 30 minutes old, not "21 hours ago", and the
 * coordinator thinks in dates.
 */
export function dayOffsetFromToday(value: Date, now: Date): number {
  const a = istYearMonthDay(value);
  const b = istYearMonthDay(now);
  const toUtcDay = (p: { year: number; month: number; day: number }) =>
    Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
  return toUtcDay(a) - toUtcDay(b);
}
