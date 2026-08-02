import { describe, expect, it } from "vitest";
import { OUTCOMES, isTerminalOutcome } from "./leads";

describe("terminal outcomes (FR-104, FR-106)", () => {
  it("treats Won and Lost as leaving the queue", () => {
    expect(isTerminalOutcome("Won")).toBe(true);
    expect(isTerminalOutcome("Lost")).toBe(true);
  });

  it("keeps every other outcome in the queue, so a date is still demanded", () => {
    // FR-104's block must survive: any outcome that leaves the lead live still
    // requires a next follow-up date.
    const live = OUTCOMES.filter((o) => !isTerminalOutcome(o));
    expect(live).toEqual([
      "Spoke",
      "No answer",
      "Busy",
      "Asked to call later",
      "Sent quote",
    ]);
  });

  it("does not treat 'Sent quote' as terminal", () => {
    // The trap: a quote sent is the moment follow-up matters most.
    expect(isTerminalOutcome("Sent quote")).toBe(false);
  });
});
