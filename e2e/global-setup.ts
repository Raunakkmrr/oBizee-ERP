/**
 * Check that something is listening, and say what to do if not.
 *
 * **What this used to do, and why it stopped.** It resolved `../obez-erp-api`,
 * ran that repository's seed scripts with that repository's `.env`, and started
 * its server. Convenient, and it meant this repository could not be cloned and
 * tested on its own: the frontend needed the backend checked out beside it, with
 * working database credentials, or nothing ran at all. Two repositories that
 * could only be used as one.
 *
 * The API now owns its own fixtures — `npm run e2e:prepare` over there. This
 * suite talks to whatever answers at `API_URL` and knows nothing about where
 * that came from: a local process, a staging deploy, a colleague's machine.
 *
 * The cost is that `npx playwright test` no longer does everything by itself,
 * and a suite that needs two commands is a suite somebody runs wrong. Hence the
 * message below, which names them.
 */
const API = process.env.API_URL ?? "http://localhost:8787";

export default async function globalSetup(): Promise<void> {
  const live = await fetch(`${API}/health`)
    .then((response) => response.ok)
    .catch(() => false);

  if (!live) {
    throw new Error(
      `No API at ${API}.\n\n` +
        `  In the API repository:  npm start\n` +
        `  Then, once:             npm run e2e:prepare\n\n` +
        `Or point this suite elsewhere with API_URL=https://…`,
    );
  }

  /*
    Fixtures are not seeded from here any more, and that is a real trade rather
    than a tidy-up. The day fixture is anchored to *today*, so it goes stale
    overnight — and a board with no jobs makes every assertion pass on an empty
    list, which is the failure the contract tests exist to remove. Running
    `e2e:prepare` is now something a person has to remember.

    So the suite checks rather than trusts. Thirty-five green tests that
    examined nothing is a worse outcome than a suite that refuses to start.
  */
  const signIn = await fetch(`${API}/auth/password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "manish@shakticooling.test", password: "obizee-dev-2026" }),
  });
  if (!signIn.ok) {
    throw new Error(
      `The seeded owner cannot sign in to ${API} (${signIn.status}).\n` +
        `  In the API repository:  npm run e2e:prepare`,
    );
  }
  const { accessToken } = (await signIn.json()) as { accessToken: string };

  const board = (await (
    await fetch(`${API}/api/board/today`, { headers: { Authorization: `Bearer ${accessToken}` } })
  ).json()) as { jobs?: unknown[] };

  if (!board.jobs?.length) {
    throw new Error(
      `${API} has no jobs on today's board, so every assertion here would pass on an empty list.\n` +
        `  In the API repository:  npm run e2e:prepare`,
    );
  }

  console.log(`API at ${API} — ${board.jobs.length} jobs on today's board`);
}
