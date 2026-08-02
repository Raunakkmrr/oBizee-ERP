# BUILD_LOG — obez-erp-web

Artifact log for `futuristic-web-build` + `futuristic-product-build`. **If the artifact does not exist,
the gate has not passed.**

Product spec: `../obez-erp-docs/PRD.md`. Phase plan: `../obez-erp-docs/PHASES.md`. Decisions and gate
record: `../obez-erp-docs/PRODUCT_LOG.md`.

> ⚠️ **GATE 7 / THE LAW #3 is SUSPENDED** for this repo by explicit client override — see
> `PRODUCT_LOG.md` **DR-9**. Frontend first; backend suppressed. No section in this log may be marked
> GREEN while the suspension stands; the ceiling is 🟡 `UI-complete · backend suspended`. Every other
> gate applies unchanged.

---

## GATE F — Foundation & stack ✅

**Verified 30 July 2026.** One command runs the whole gate: `pnpm verify` →
`typecheck` → `lint` → `check:contrast` → `next build`. All four pass.

### Stack record

| Layer | Choice | Version | Note |
|---|---|---|---|
| Runtime | Node.js | **22.23.1** | Pinned in `.nvmrc`. The machine's PATH default was **v19.9.0 — end-of-life**; Next 16 requires ≥20.9. |
| Package manager | pnpm | 10.24.0 | |
| Framework | Next.js (App Router) | **16.2.12** | Turbopack is the default in 16 — no `--turbopack` flag needed |
| Language | TypeScript | **5.9.3** | Not 7.0.2 — see "latest-stable exceptions" below |
| UI runtime | React / React DOM | **19.2.7** | |
| Styling | Tailwind CSS | 4.3.3 | `@tailwindcss/postcss` |
| Component registry | shadcn CLI | **4.16.0** | `components.json` present → `npx shadcn@latest add …` works (**THE LAW #2**) |
| Registry style | `radix-nova`, base **radix** | — | See "primitive base" below |
| Icons | lucide-react | 1.28.0 | Outline family, stroke-adjustable — §6.13.10 wants 1.75px stroke |
| Primitives | radix-ui | 1.6.7 | |
| Lint | ESLint + eslint-config-next | **9.39.5** / 16.2.12 | Not 10.8.0 — see below |
| Fonts | Inter + Noto Sans ×7 | via `next/font/google` | §6.13.5 |

### Latest-stable exceptions — attempted, verified broken, reverted with evidence

Gate F requires latest stable libraries and forbids stale major pins. Both candidate majors were
installed and tested; both break the toolchain through `eslint-config-next`'s own dependency tree. These
are documented upstream incompatibilities, not convenience pins, and both are revisited when upstream
ships support.

| Package | Latest | Using | Why |
|---|---|---|---|
| `typescript` | 7.0.2 | **5.9.3** | `typescript-eslint` refuses to load: *"typescript-eslint does not support TS 7.0"*, tracking [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) for TS ≥7.1. TS 7 means **no linting at all**, which fails Gate F harder than the pin does. `tsc --noEmit` itself passed clean on 7.0.2. |
| `eslint` | 10.8.0 | **9.39.5** | `eslint-plugin-react@7.37.5` (transitive via `eslint-config-next`) calls the context API ESLint 10 removed → `TypeError: contextOrFilename.getFilename is not a function`. Also an unmet peer on `eslint-plugin-import` (caps at eslint 9). |
| `@types/node` | 26.1.2 | **22.20.1** | Not stale — `@types/node`'s major tracks the Node runtime major, and the runtime is Node 22. 26.x would type against APIs this runtime does not have. |

### Primitive base — why Radix and not React Aria

The CLI offers `base` (Base UI), `radix` (Radix) and `aria` (React Aria). **React Aria has the stronger
accessibility and keyboard story**, which is genuinely tempting given §6.6.3 (the lead queue is
keyboard-only by design), §9.6 (full keyboard operability, TalkBack + NVDA as test targets) and the
data-grid-heavy screen list.

**Radix wins anyway, for one decisive reason:** THE LAW #2 requires components to be *imported* from the
21st.dev / Aceternity / Magic UI registries, and those are overwhelmingly built on Radix. Choosing `aria`
would make the mandated imports incompatible with the project — trading a doctrine requirement for a
library preference. The accessibility gap is closed by our own gates instead: the §9.6 checks, the
keyboard audit, and the contrast gate below.

### RTL — deliberately off

`--no-rtl`. The `futuristic-product-architect` doctrine's generic NFR list assumes *"AR default + RTL"*,
but this product's PRD is India-only: English plus eight Indic languages (§9.7), **all left-to-right**.
No Arabic, Urdu or Hebrew locale exists in the spec. Carrying RTL machinery would be dead weight against
the §9.1 bundle budget.

### Product-mode foundations (`futuristic-product-build` Gate F additions)

| Decision | Value | Source |
|---|---|---|
| **Money representation** | 64-bit integer **paise**, never float, never decimal-string-parsed-to-float. Every field name ends `_paise`. One shared `en-IN` formatter renders `₹12,34,567.89`; the integer is what is stored and transmitted. | FR-801, FR-813, §6.13.6 |
| **Locale / type scale** | `en-IN`. Dates `DD/MM/YYYY` and `30 Jul 2026`; FY as `2026-27`; **IST only, no timezone selector**. Type scale locked to 8 tokens, **12px floor**, 16px body (not 14). | §6.13.5, §9.7 |
| **Tenancy model** | Shared schema, `tenant_id` on every table, **PostgreSQL row-level security** driven by the authenticated session — not a request parameter, not ORM-only. ⚠️ Not yet implemented: backend suspended (DR-9). | §9.3 |
| **Permission matrix** | Five roles — Owner, Coordinator, Technician, Accountant, Read-only CA. UI hides what a role cannot do; **the API refusing it is the actual control**. ⚠️ Server enforcement suspended (DR-9), so the current UI gating is a courtesy with no control behind it. Recorded as a known gap, not a shipped feature. | FR-1301, §9.4 |

### Design tokens — §6.13, implemented and machine-verified

`src/app/globals.css` is the single source of truth. shadcn's semantic variables (`--color-card`,
`--color-muted-foreground`, `--color-input`, …) are **remapped onto** the §6.13 tokens rather than
living beside them, so every future registry import inherits the design system instead of fighting it.

Implemented: 3-stage colour system (primary / surfaces+ink / six status families) · 8-step type scale
with a 12px floor and a 20px sign-off floor · exactly three elevations · exactly three radii, with every
Tailwind step aliased onto one of them so an imported `rounded-xl` cannot introduce a fourth · the
z-index scale with the offline strip outranking modals · motion durations with `prefers-reduced-motion`
honoured · the density contracts (44px Today row, 56px top bar, 48/56px tap targets) · `tnum`,
`tnum-id` and `money` numeral utilities.

**No dark theme.** §6.13 defines one palette with ratios verified against light surfaces; a dark variant
would have to invent tokens whose ratios are not in the spec, which §6.13's opening rule forbids. It also
works against the product's hardest constraint — an LCD panel in direct sunlight needs maximum luminance
and high positive contrast. The `dark` variant stays registered so imported components carrying `dark:`
classes still compile; they simply never activate.

### Contrast gate — `pnpm check:contrast`

§6.13 states its ratios "are part of the acceptance criteria — a token change that breaks a ratio fails
CI". `scripts/check-contrast.mjs` is that CI check. It **parses the real token values out of
`globals.css`** rather than hard-coding them, so editing a token and forgetting its comment cannot pass.

**34 pairings, 0 failing.** Floor 7:1 for all data text (§9.6, above WCAG AA), 3:1 for meaningful
non-text. Two tokens are pinned *below* a ceiling on purpose — `--ink-disabled` (3.82:1) and
`--border-hairline` (1.55:1) — because being visibly weaker than data is their entire job, and the check
stops a well-meaning future edit from "fixing" them.

🔴 **The gate immediately caught a real defect in the PRD's own design system — logged as D11 in
`PRODUCT_LOG.md`.** §6.13.3 documents `--ink-500` at 7.27:1, which is true on white but not on the
surfaces the product actually uses: **6.72:1 on `--surface-canvas`** (described in the same section as
"the largest single coloured region in the product") and **6.26:1 on `--surface-sunken`** (table headers,
group headers, input backgrounds). Both fall below the 7:1 data floor, and ink-500 is the designated
token for meta text, timestamps and helper text — all real data. The PRD verified its ink tokens against
white only. Corrected to **`#454D5B`**, which clears 7:1 on white (8.52), canvas (7.87), sunken (7.33)
and state-neutral-bg (7.40); the gate now checks ink tokens against **every** text-bearing surface.

### Fonts — §6.13.5

`src/lib/fonts.ts`. **Inter** carries Latin and every numeral (true tabular figures + opt-in slashed
zero, both mandatory under §6.13.6). **Noto Sans** per Indic script — Devanagari, Tamil, Telugu, Kannada,
Gujarati, Bengali, Malayalam — because Inter has zero Indic coverage and browser fallback produces
mismatched x-heights and, worse, **broken conjunct shaping that renders some words wrong rather than
merely ugly**.

Locale → face mapping loads exactly one Indic face, so only what a locale needs is preloaded (§6.13.5's
"subsetted per language pack"). Hindi and Marathi share the Devanagari face — two languages, one script.
`en` loads **no** Indic face at all, which matters because English is the default for the two personas
most likely to be on a metered connection.

**No monospace face.** §6.13.5 specifies none, and the two jobs a mono font would do here — aligned
figures and unambiguous zeros — are done by Inter's `tabular-nums` and `slashed-zero`. `--font-mono` is
aliased to the real stack so registry components using `font-mono` degrade sensibly.

**Next 16 gotcha, recorded:** `next/font` resolves its calls by statically parsing the argument at build
time, so options must be inline literals. A shared options object spread into each call fails the build
with `Unexpected spread` — the repetition in `fonts.ts` is required, not careless.

### Next 16 breaking changes that shape this build

Read from `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (the repo's `AGENTS.md`
warns that this Next.js differs from training data — the docs were read before any code was written).

| Change | Consequence here |
|---|---|
| `middleware` → **`proxy.ts`**, `nodejs` runtime only | Role-based route gating goes in `proxy.ts`. Edge runtime is not available. |
| `cookies`, `headers`, `params`, `searchParams` are **async-only** | Session and route param reads are all `await`ed. |
| `next typegen` generates `PageProps<'/route'>`, `LayoutProps`, `RouteContext` | Use these instead of hand-written prop types. |
| **Parallel routes require explicit `default.tsx`** or the build fails | Directly relevant: §6.5 wants Job detail as a right drawer from any list **and** as a full page at its own URL — the intercepting + parallel routes pattern. |
| `revalidateTag` needs a `cacheLife` second argument; `updateTag` gives read-your-writes; `refresh()` refreshes the client router | Matters at Phase 14 when mutations become real. |
| `next lint` removed; `next build` no longer lints | `pnpm verify` chains lint explicitly. |
| Scroll-behaviour no longer overridden during navigation | Left at the new default — §6.13.8 wants navigation instant, not animated. |

### Environment notes

- The project lives on an **exFAT volume**, so macOS writes an AppleDouble sidecar (`._<name>`) beside
  every file. These are binary resource forks that every parser chokes on. Ignored in `eslint.config.mjs`
  and `.gitignore`. Six eslint parse errors traced to exactly this before it was handled.
- Own git repository, initialised by `create-next-app`. No shared tooling with any sibling repo (DR-3).

---

## Phase 0 — foundation modules

No UI sections yet. These are the modules every screen depends on, built and tested first so no screen
has to invent its own money format, role check or nav order.

`pnpm verify` = typecheck → lint → contrast (34 pairings) → tests (**76**) → build. Green.

### `src/lib/money.ts` — FR-801, FR-813, §6.13.6 · 20 tests

Money is a **branded `Paise` type**, so a plain `number` will not type-check where paise is expected —
passing rupees into a paise field is a compile error rather than a 100× bug found at month-end.
`asPaise()` is the only constructor and rejects any non-safe-integer, which is the client-side
counterpart of FR-801's `422 MONEY_MUST_BE_INTEGER_PAISE`.

**Formatting never divides by 100 in floating point.** `abs - (abs % 100)` is exact for any safe
integer, and dividing an exact multiple of 100 yields an exactly representable result — so no rounding
error can enter at the render step. Tested against the values that actually break float money:
`(0.1 + 0.2) * 100` is rejected, and `₹0.10` — which IEEE-754 cannot represent — renders exactly.

Four renderings, because §6.13.6 needs four and mixing them is a defect: `formatMoney` (`₹12,34,567.89`,
credits in parentheses), `formatMoneyBare` (accounting tables under a ₹-labelled heading),
`formatMoneyForCustomer` (`Advance ₹1,200.00` — never a minus in a customer's face), `formatMoneyAxis`
(`₹3.1L` / `₹1Cr` — **the only place abbreviation is permitted**, and only because the tooltip carries
the full figure).

**Money arithmetic is deliberately absent.** Tax computation, line rounding and the CGST/SGST split
(FR-812) are server-side; a client-side copy would be a second source of truth for a number that must
foot exactly.

### `src/lib/datetime.ts` — §9.7 · 16 tests

Every formatter pins `Asia/Kolkata` explicitly rather than inheriting the ambient zone. **The suite runs
in UTC, IST and America/Los_Angeles and gets identical results** — so a timezone leak fails here rather
than in production. This matters beyond display: §9.2 requires reports to use `occurred_at`, because a
technician who finished at 4pm in a basement and synced at 7pm did the job at 4pm.

`financialYear()` is pinned on both sides of the 1 April boundary **in IST**, because IST is *ahead* of
UTC and the FY therefore rolls over 5.5 hours before the UTC date does. FR-811 resets statutory invoice
numbering per FY with the year in the series (`SVC/26-27/0148`), so an off-by-one here produces a
duplicate invoice number — a filing defect, not a cosmetic one.

### `src/lib/roles.ts` — FR-1301, FR-1302, §3, §9.4 · 21 tests

Five roles, ~30 coarse `resource:action` permissions, each role's grant list annotated with the §3
sentence it implements. Coarse on purpose: a matrix of sixty near-identical entries gets copied wrongly,
and §6.3's permission-error state must name a role a human can go and ask.

**Mostly negative tests**, because a permission matrix rarely breaks by forgetting to grant something —
that gets noticed the first time someone opens the screen. It breaks by quietly granting something.
Pinned: the technician has no customer directory and no price permission at all by default; only the
technician can assert what happened at site (§4.2 rule 1 — "a dispatcher marking a job done from the
office is how field data becomes fiction"); the coordinator never sees cost prices even with the billing
toggle on; the accountant has no dispatch; the read-only CA can write *nothing* operational.

⚠️ **Recorded gap, not a feature:** §9.4 says "the UI hiding a control is a courtesy; the API refusing it
is the control." Under DR-9 there is no API, so **every check in this module is currently a courtesy with
nothing behind it** — and FR-1302's price stripping in particular must be server-side, because the
payload is readable. This is the first thing to close when the backend phase opens.

### `src/lib/navigation.ts` — §6.2 · 19 tests

The nine primary destinations with §6.2's per-position rationale stored beside each, because §6.2 calls
the ordering "a requirement, not a layout preference". Tests pin the claims that erode one reasonable
tweak at a time: Today first, Jobs second, Leads adjacent to Jobs, **Parts at position 7** (§6.2: "if
this ever creeps upward, the product has drifted off its thesis"), Settings last.

**Badges are a closed union of three variants** — `unassigned_today`, `leads_overdue`,
`invoices_overdue`. §6.2 forbids a badge that shows a total ("1,482 customers"), and modelling the
allowed badges as a closed type means there is no way to *express* a total badge. The prohibition is
structural rather than a review note.

The accountant's rail starts at Invoices & Payments (defect **D10**), and the technician gets exactly
three tabs with a test asserting the eight destinations he must never see.

A cross-check asserts no role is ever shown a destination its permissions forbid — a nav item a role
cannot use is a dead end, and §6.3 wants dead ends replaced by next steps.

### Recorded along the way

- **`tsc` caught what `vitest` could not.** An `Object.fromEntries` → `Record<Role, …>` cast in the
  permission matrix is unsound and TypeScript rejected it. Removed rather than forced through with
  `as unknown`: buying microseconds with a cast on the authorisation path is the wrong trade, so `can()`
  scans a ~30-entry array instead.
- **Two test failures were my errors, not the code's** — `10000000000` paise is ₹10 crore not ₹1 crore,
  and `2027-04-01T00:00:00Z` is 05:30 *on 1 April* in IST because IST leads UTC. Both formatters were
  right; the expectations were wrong. Fixed the tests.
- **lucide-react v1 renamed many icons**, so every icon name used was verified against the installed
  package rather than recalled. `ReceiptIndianRupee` exists and is used for Invoices & Payments.
- The exFAT `._*` sidecars also match vitest's `src/**/*.test.ts` glob and fail to transform. Excluded in
  `vitest.config.ts` — the third place on this volume needing the same exclusion.

### `src/lib/data/` — the DR-9 boundary · 15 tests

`result.ts` makes §6.3's four states a discriminated union, so a screen cannot
forget one. Two rules become *unrepresentable* rather than merely discouraged:

- **`Computed<T>`** — a value that might not be computable has no numeric value in its failure branch,
  so there is nothing to accidentally render as `0`. §6.3 calls showing ₹0 for a figure that failed to
  load "the worst defect class this product can ship", and §3.1 says the owner abandons the product when
  a home-screen number disagrees with his accountant. A test asserts the money formatter is **never
  called at all** on the failure path.
- **Partial failures ride inside the ready state**, so a failed secondary source cannot collapse the
  query — §6.3's rule (a) is structural.

Emptiness is deliberately **not** a fetch state: it is a property of the data, and only the caller knows
whether it means "nothing exists" or "nothing matches your filter", which need different sentences.

`source.ts` binds one zod contract to a fixture now and an API later. It **never throws** — every outcome
is one of the four states. Two behaviours worth keeping: network-shaped throws are classified as
`connectivity` so content survives a wifi flicker mid-call, and a build configured for `api` with no API
implementation **fails loudly instead of silently serving fixtures** — a production build rendering
invented numbers that look real would be the most dangerous thing this module could do.

### `src/components/data-states/` + `src/components/shell/`

Four state components composing six **imported** shadcn primitives (`alert`, `button`, `skeleton`,
`badge`, `separator`, `tooltip`), plus the shell: fixed 56px top bar with the §6.13.1 lockup, and one
`PrimaryNav` rendering all three §6.2 tiers — 232px labelled rail ≥1280, 56px icon+tooltip rail
1024–1279, labelled bottom bar below. Never a hamburger; §2.2 lists hidden navigation as a non-goal
because it "reads as a missing feature to this user base".

Deliberately absent from the top bar: **global search and the branch switcher**. Both need a real
destination and under DR-9 there is none — a control that goes nowhere is a dead link, which the
navigation audit fails on. They arrive with the screens that back them.

`src/app/page.tsx` is a foundation preview — not a product screen, but a living reference so the tokens,
states and formatters can be *looked at*. Replaced by the primary post-login screen in Phase 1.

### 🔴 Two defects that only rendering could catch (LAW #8)

Both passed typecheck, lint, 92 tests and the contrast gate. Neither was findable without opening a
browser, which is exactly why "unseen = unshipped" is a law and not a nicety.

1. **The entire product rendered in serif.** `--font-sans` listed `var(--font-indic)` with no inline
   fallback. On English that variable is intentionally undefined — and a `var()` that resolves to nothing
   makes the whole `font-family` declaration **invalid at computed-value time**, so the browser fell back
   to its default serif. Inter never loaded, and with it went every tabular figure the money column
   depends on. Fixed with `var(--font-indic, ui-sans-serif)`.
2. **"Invoices & Payments" truncated to "Invoices & Payme…"** in the 232px rail. §9.7 requires labels to
   **wrap, never truncate** — "a button whose Tamil label overflows is a layout defect, not a translation
   defect". English already overflowed; the Indic translations are longer. `truncate` replaced with
   wrapping in both the rail and the bottom bar.

Also fixed: `turbopack.root` pinned to this repo. Turbopack was inferring a workspace root from the
sibling projects in `/oBizee` — precisely the coupling DR-3 rules out.

**Verified in browser at 1366×768** (Priya's actual laptop): all four data states, all three error kinds
rendering distinctly with word + shape + colour, the empty state matching §6.3's worked example, the
permission error naming who to ask, and the error code in copyable small print rather than in the
message.

*Note on a judgement call:* the permission error uses the `state-neutral` family. §6.13.4 assigns neutral
to Created/Scheduled/Cancelled/Closed/Draft and does not name a family for permission refusals. Neutral
was chosen because a refusal is a boundary, not a failure, and red would misread under §6.13.4's own
"red is auspicious" caution. Flagged rather than assumed.

## Remaining in Phase 0

The four data states as reusable primitives (§6.3) · the app shell (232px rail / 56px icon rail /
labelled bottom bar, role-aware) · the i18n framework · the typed data-access layer with zod contracts
and a fixture adapter · production-shaped seed fixtures · then the **GATE P4 app map** for the client's
review, which is the feature inventory that has to be agreed before any screen is built.
