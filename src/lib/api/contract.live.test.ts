import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { boardSchema } from "../data/board";
import { customersSchema } from "../data/customers";
import { gstPeriodSchema, periodToFile } from "../data/gst";
import { homeSnapshotSchema } from "../data/home";
import { jobDetailSchema } from "../data/job-detail";
import { leadsSchema } from "../data/leads";
import { moneySchema } from "../data/money";
import { ownerHomeSchema } from "../data/owner-home";
import { peopleSchema } from "../data/people";
import { partsSchema } from "../data/parts";
import { reportsSchema } from "../data/reports";

/**
 * The seam between the two repos.
 *
 * Every screen in this app trusts that what the API sends parses. This is the
 * only place that proves it, against a running server and a real database —
 * not a mock, which would only prove the mock agrees with itself.
 *
 * It found four real defects the first time it ran: contact roles the two
 * sides spelled differently, an asset condition list that disagreed, a lead
 * outcome the API accepted and dropped, and a GST readiness model that blocked
 * exports on legitimate place-of-supply overrides.
 *
 * Skipped when the API is not running, so `vitest run` stays green offline.
 */
const BASE = process.env.API_URL ?? "http://localhost:8787";

const reachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

async function accessToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "manish@shakticooling.test",
      password: "obizee-dev-2026",
    }),
  });
  return (await res.json()).accessToken;
}

/** Names the field that disagrees, rather than "invalid". */
function parseOrExplain<T>(schema: z.ZodType<T>, body: unknown, what: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `${what} does not match its schema:\n` +
        parsed.error.issues
          .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n"),
    );
  }
  return parsed.data;
}

describe.skipIf(!reachable)("live API satisfies the web app's schemas", () => {
  it("serves every read-side screen in the shape it renders", async () => {
    const token = await accessToken();
    const get = async (path: string) => {
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status, `GET ${path}`).toBe(200);
      return res.json();
    };

    const customers = parseOrExplain(customersSchema, await get("/api/customers"), "customers");
    const board = parseOrExplain(boardSchema, await get("/api/board/today"), "board");
    const leads = parseOrExplain(leadsSchema, await get("/api/leads"), "leads");
    const money = parseOrExplain(moneySchema, await get("/api/money/overview"), "money");
    parseOrExplain(homeSnapshotSchema, await get("/api/home/snapshot"), "home");
    parseOrExplain(ownerHomeSchema, await get("/api/home/owner"), "owner home");
    parseOrExplain(reportsSchema, await get("/api/reports/weekly"), "reports");
    parseOrExplain(gstPeriodSchema, await get(`/api/gst/${periodToFile()}`), "gst period");
    /*
      Owner only, and the seeded sign-in is the owner. This one caught a real
      mismatch: `phone` was required while every office user has none.
    */
    const team = parseOrExplain(peopleSchema, await get("/api/people"), "people");
    expect(team.people.length).toBeGreaterThan(0);

    /*
      Stock. All four sections asserted non-empty: a reorder list with nothing
      on it and an exception list that is always clear are what a stock screen
      looks like when nobody has pointed it at real movements.
    */
    const stock = parseOrExplain(partsSchema, await get("/api/parts"), "parts");
    expect(stock.reorder.length, "nothing below its reorder level").toBeGreaterThan(0);
    expect(stock.locations.length, "no store or van").toBeGreaterThan(0);
    expect(new Set(stock.exceptions.map((e) => e.kind)).size, "not every exception kind is exercised").toBe(3);

    /*
      A schema check on an empty array passes and proves nothing — which is how
      the customers screen "passed" while the database held no contacts at all.
      These assert the fixture is actually exercising the shapes.
    */
    expect(customers.customers.length, "no customers seeded").toBeGreaterThan(0);
    expect(
      customers.customers.flatMap((c) => c.sites).flatMap((s) => s.contacts).length,
      "no site contacts seeded — the shape below them is unproven",
    ).toBeGreaterThan(0);
    expect(board.jobs.length, "no jobs today — run seed-day").toBeGreaterThan(0);
    expect(board.technicians.length).toBeGreaterThan(0);
    expect(leads.leads.length, "no open leads — run seed-day").toBeGreaterThan(0);
    expect(money.receivables.length).toBeGreaterThan(0);

    // The board's counters must describe the rows it actually sent.
    expect(board.counters.unassigned).toBe(board.jobs.filter((j) => j.technician === null).length);
  });

  it("serves one job in the shape the detail screen renders", async () => {
    const token = await accessToken();
    const board = await (
      await fetch(`${BASE}/api/board/today`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();

    const res = await fetch(`${BASE}/api/job/${board.jobs[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const detail = parseOrExplain(jobDetailSchema, await res.json(), "job detail");
    expect(detail.jobNumber).toMatch(/\S/);
    expect(detail.site.addressLine).toMatch(/\S/);
  });

  it("refuses an unauthenticated read", async () => {
    expect((await fetch(`${BASE}/api/customers`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/board/today`)).status).toBe(401);
  });
});
