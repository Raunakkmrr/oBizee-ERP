/**
 * Which jobs are in trouble, and which kind of trouble.
 *
 * **Why this exists.** A work order carried no signal at all beyond its status
 * chip, and the status chip says what somebody *did* — Created, Assigned — not
 * whether anything is wrong. So a visit whose date passed three weeks ago with
 * nobody sent looked exactly like one booked for next Tuesday. Raunak read a
 * screen full of `Created / Unassigned` and could not tell which of them were
 * on fire, which is the correct reaction to a list that does not say.
 *
 * **Three problems, three signals**, because collapsing them into one red would
 * put red on roughly forty of fifty-five rows and red that common stops being
 * read:
 *
 * | Signal | Means | Why it is that colour |
 * |---|---|---|
 * | `overdue` | the date passed, the work is not done | a promise already broken — the only one that is *late* |
 * | `unassigned` | due within three days, nobody going | still fixable, and only by acting now |
 * | `undated` | no date at all | a stub. Not late, because nothing was ever promised |
 *
 * **Precedence is deliberate.** A job that is both overdue and unassigned is
 * *overdue* — being late is the fact that has already cost something, and
 * "nobody assigned" is the reason rather than the problem.
 *
 * A completed, signed-off or cancelled job is never flagged, however old. The
 * date passing is what it is *supposed* to do once the work is done.
 */
export type Attention = {
  kind: "overdue" | "unassigned" | "undated";
  /** A word, never a bare colour (§6.4.2, P3). */
  word: string;
  /** The full sentence, for a tooltip or the detail screen. */
  reason: string;
};

/** Work that has already happened, or will never happen. */
const SETTLED = new Set(["WORK_DONE", "SIGNED_OFF", "CANCELLED"]);

/**
 * Three days, and the reason for three.
 *
 * A visit is assigned the day before in most firms, so a two-day window would
 * warn on the morning it is already too late to arrange cover. Three gives a
 * coordinator a working day of slack over a weekend.
 */
const SOON_DAYS = 3;

/** Midnight in India, so "today" means the day the coordinator is having. */
function startOfDayInIndia(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Date.parse(`${parts}T00:00:00+05:30`);
}

export function attentionFor(
  job: {
    status: string;
    scheduledDate: string | null;
    technician: { id: string; name: string } | null;
  },
  now: Date,
): Attention | null {
  if (SETTLED.has(job.status)) return null;

  if (!job.scheduledDate) {
    return {
      kind: "undated",
      word: "No date",
      reason: "Nobody has said when this happens.",
    };
  }

  const today = startOfDayInIndia(now);
  const due = Date.parse(`${job.scheduledDate}T00:00:00+05:30`);
  if (Number.isNaN(due)) return null;

  const days = Math.round((due - today) / 86_400_000);

  if (days < 0) {
    const late = Math.abs(days);
    return {
      kind: "overdue",
      word: late === 1 ? "1 day late" : `${late} days late`,
      reason: `Due ${job.scheduledDate}. The work is not done and the date has passed.`,
    };
  }

  if (!job.technician && days <= SOON_DAYS) {
    return {
      kind: "unassigned",
      word: days === 0 ? "Today, nobody going" : `In ${days}d, nobody going`,
      reason: "Nobody is assigned and the date is close enough to matter.",
    };
  }

  return null;
}

/** Token classes per kind. Kept beside the rule so the two cannot drift. */
export const ATTENTION_TONE: Record<Attention["kind"], string> = {
  overdue: "bg-destructive/12 text-destructive",
  unassigned: "bg-warning/12 text-warning",
  undated: "bg-muted text-muted-foreground",
};

/**
 * `2026-10-15` → `15 Oct 2026`.
 *
 * The ISO form is right for a dense table column, where it aligns and sorts by
 * eye. It is wrong in a sentence on the detail screen, where a reader is
 * checking a date against a memory of a phone call — so the two surfaces format
 * the same field differently, on purpose.
 */
export function dayWords(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(at)) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(at);
}
