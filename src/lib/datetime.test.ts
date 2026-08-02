import { describe, expect, it } from "vitest";
import {
  dayOffsetFromToday,
  greetingFor,
  financialYear,
  financialYearShort,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatTime,
} from "./datetime";

describe("IST is pinned, not inherited from the runtime (§9.7)", () => {
  it("rolls the calendar date forward for a late-evening UTC instant", () => {
    // 18:45 UTC on 30 Jul is 00:15 IST on 31 Jul. A formatter using the ambient
    // zone would render 30 Jul on a UTC server and 31 Jul on an IST laptop.
    const moment = new Date("2026-07-30T18:45:00Z");
    expect(formatDate(moment)).toBe("31/07/2026");
    expect(formatDateLong(moment)).toBe("31 Jul 2026");
  });

  it("keeps an early-morning UTC instant on the same IST day", () => {
    const moment = new Date("2026-07-30T04:00:00Z"); // 09:30 IST
    expect(formatDate(moment)).toBe("30/07/2026");
  });

  it("formats DD/MM/YYYY, never the US order", () => {
    // 3 February, not 2 March — the distinction a coordinator reading aloud
    // cannot afford to get wrong.
    expect(formatDate(new Date("2026-02-03T06:00:00Z"))).toBe("03/02/2026");
  });
});

describe("formatTime — 12-hour with lower-case am/pm (§9.7)", () => {
  it("lower-cases the meridiem", () => {
    expect(formatTime(new Date("2026-07-30T06:12:00Z"))).toBe("11:42 am");
    expect(formatTime(new Date("2026-07-30T11:00:00Z"))).toBe("4:30 pm");
  });

  it("uses a plain space, so the string is safe to search and to send", () => {
    const rendered = formatTime(new Date("2026-07-30T06:12:00Z"));
    expect(rendered).not.toMatch(/ | /);
    expect(rendered.split(" ")).toHaveLength(2);
  });

  it("renders a full moment for timelines and audit rows", () => {
    expect(formatDateTime(new Date("2026-07-30T06:12:00Z"))).toBe(
      "30 Jul 2026, 11:42 am",
    );
  });
});

describe("financialYear — 1 April to 31 March (§9.7, FR-811, FR-803)", () => {
  it("treats April as the start of the new FY", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00+05:30"))).toBe("2026-27");
    expect(financialYear(new Date("2026-07-30T12:00:00+05:30"))).toBe("2026-27");
    expect(financialYear(new Date("2026-12-31T12:00:00+05:30"))).toBe("2026-27");
  });

  it("puts January to March in the FY that began the previous calendar year", () => {
    expect(financialYear(new Date("2027-01-01T12:00:00+05:30"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T12:00:00+05:30"))).toBe("2026-27");
  });

  it("rolls over on 1 April, not 1 January", () => {
    expect(financialYear(new Date("2027-03-31T23:59:00+05:30"))).toBe("2026-27");
    expect(financialYear(new Date("2027-04-01T00:01:00+05:30"))).toBe("2027-28");
  });

  it("computes the boundary in IST, not in the runtime zone", () => {
    // IST is UTC+5:30, i.e. AHEAD of UTC, so the IST date rolls over 5.5 hours
    // BEFORE the UTC date does. Getting this wrong duplicates a statutory
    // invoice number (FR-811), which is a filing defect rather than a cosmetic
    // one — so both sides of the boundary are pinned here.

    // 23:30 IST on 31 Mar — still the old FY.
    expect(financialYear(new Date("2027-03-31T18:00:00Z"))).toBe("2026-27");
    // 00:30 IST on 1 Apr — the new FY, while UTC is still on 31 March.
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("2027-28");
    // UTC midnight on 1 Apr is 05:30 IST on 1 Apr: also the new FY.
    expect(financialYear(new Date("2027-04-01T00:00:00Z"))).toBe("2027-28");
  });

  it("gives the compact form used inside document series", () => {
    // FR-811's example series: SVC/26-27/0148
    expect(financialYearShort(new Date("2026-07-30T12:00:00+05:30"))).toBe(
      "26-27",
    );
  });

  it("handles a century-crossing FY label", () => {
    expect(financialYear(new Date("2099-05-01T12:00:00+05:30"))).toBe("2099-00");
  });
});

describe("greetingFor — resolved in IST, not the browser's zone", () => {
  it("greets by IST hour", () => {
    expect(greetingFor(new Date("2026-07-31T09:00:00+05:30"))).toBe(
      "Good morning",
    );
    expect(greetingFor(new Date("2026-07-31T14:00:00+05:30"))).toBe(
      "Good afternoon",
    );
    expect(greetingFor(new Date("2026-07-31T20:00:00+05:30"))).toBe(
      "Good evening",
    );
  });

  it("does not say 'Good morning' at 11:45 pm", () => {
    // The exact defect this replaced: the greeting was hardcoded, and the first
    // render of this screen said "Good morning, Priya" at 23:45.
    expect(greetingFor(new Date("2026-07-31T23:45:00+05:30"))).toBe(
      "Good evening",
    );
  });

  it("uses IST even when the runtime is far from it", () => {
    // 20:00 UTC is 01:30 IST the next day — evening, not afternoon.
    expect(greetingFor(new Date("2026-07-31T20:00:00Z"))).toBe("Good evening");
    // 04:00 UTC is 09:30 IST — morning.
    expect(greetingFor(new Date("2026-07-31T04:00:00Z"))).toBe("Good morning");
  });

  it("handles the boundaries without a gap", () => {
    expect(greetingFor(new Date("2026-07-31T04:59:00+05:30"))).toBe(
      "Good evening",
    );
    expect(greetingFor(new Date("2026-07-31T05:00:00+05:30"))).toBe(
      "Good morning",
    );
    expect(greetingFor(new Date("2026-07-31T11:59:00+05:30"))).toBe(
      "Good morning",
    );
    expect(greetingFor(new Date("2026-07-31T12:00:00+05:30"))).toBe(
      "Good afternoon",
    );
    expect(greetingFor(new Date("2026-07-31T17:00:00+05:30"))).toBe(
      "Good evening",
    );
  });
});

describe("dayOffsetFromToday — calendar dates, not elapsed hours (§6.6)", () => {
  const now = new Date("2026-07-30T04:00:00Z"); // 09:30 IST on 30 Jul

  it("returns 0 for the same IST day", () => {
    expect(dayOffsetFromToday(new Date("2026-07-30T18:00:00Z"), now)).toBe(0);
  });

  it("returns 1 for tomorrow and -1 for yesterday", () => {
    expect(dayOffsetFromToday(new Date("2026-07-31T05:00:00Z"), now)).toBe(1);
    expect(dayOffsetFromToday(new Date("2026-07-29T05:00:00Z"), now)).toBe(-1);
  });

  it("counts a date boundary rather than a 24-hour window", () => {
    // 30 Jul 20:00 IST and 31 Jul 00:30 IST are 4.5 hours apart but are
    // different days — and the coordinator thinks in days.
    const lateTonight = new Date("2026-07-30T14:30:00Z"); // 20:00 IST, 30 Jul
    const justAfterMidnight = new Date("2026-07-30T19:00:00Z"); // 00:30 IST, 31 Jul
    expect(dayOffsetFromToday(lateTonight, now)).toBe(0);
    expect(dayOffsetFromToday(justAfterMidnight, now)).toBe(1);
  });

  it("spans months and years correctly", () => {
    expect(dayOffsetFromToday(new Date("2026-08-06T05:00:00Z"), now)).toBe(7);
    expect(dayOffsetFromToday(new Date("2027-07-30T05:00:00Z"), now)).toBe(365);
  });
});
