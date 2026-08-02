# Phase 1 — the primary post-login screen

Gate artifacts for `futuristic-web-build` + `futuristic-product-build`, Phase 1. Kept beside
`BUILD_LOG.md` (Gate F and the Phase 0 foundation modules).

> **Why this screen is first.** `futuristic-web-expand`'s GATE D hard-blocks until the "homepage" exists
> and passes. In product mode that homepage is the **primary post-login screen** — the operational home.
> Building it first is not a preference; it is the dependency that unblocks every other screen, and
> getting it wrong at Phase 10 (where the plan originally had it) would have meant reworking everything
> built against it.

---

## GATE 1 — The brief

### 1. Business — what they actually do, and who they serve

An Indian MSME service firm: 3–60 technicians, ₹40 lakh–₹20 crore, whose business is **sending a person
to a customer's site to do work** — AC and refrigeration servicing, lift and generator AMC, water
treatment, CCTV and fire systems, medical and industrial equipment repair, solar O&M, pest control.

The product owns one loop end to end: **lead → job → dispatch → work done → parts consumed → customer
sign-off → WhatsApp confirmation → GST invoice → payment.** Everything else exists because that loop
needs it. Inventory exists because a technician fits a capacitor. Accounting exists because the job has
to become a legal tax invoice.

**What the buyer fears.** Not "lack of features" — being *unable to see*. Three fears, each of which the
primary screen has to answer before 10am:

1. A job is stuck and nobody has told me.
2. Money went out the door and nobody billed it.
3. A customer is angry and I found out from the customer.

**Differentiators, from the P1 research (`obez-erp-docs/research/p1-competitor-teardowns.md`, 20 teardowns):**

- **Offline job *completion* is undefended across the whole category**, and the incumbents say so in
  their own documentation — Zoho FSM offline is read-only with invoices/check-in/status/parts explicitly
  "Not supported"; Odoo staff wrote Field Services "does not work offline… no current plans"; Housecall
  Pro says editing without cell service "is not supported"; FieldWeb, the 50,000-install distribution
  leader, makes no offline claim at all.
- **Nobody produces a correct mixed HSN/SAC GST invoice from a technician's job card in one SKU.**
- **The job sits at the top of the hierarchy**, not inventory. Every incumbent this buyer can reach is
  inventory-first or ledger-first.
- **Flat per-company pricing with nothing in the core loop gated**, against Zoho FSM's per-appointment
  meter that silently stops generating AMC visits when the quota runs out.

**Proof available to put on the screen:** none yet — no tenant, no data. This matters for Gate 1's
"proof" requirement and is handled honestly: the screen's credibility comes from *the user's own numbers
being right*, not from testimonials. That is the product-mode translation.

### 2. Market — why now

- **KaryaFlow** (CIN 2026, Odisha) is already shipping approximately this thesis at ₹999–₹3,999/month
  flat. The window is visible to others.
- WhatsApp is at ~97% penetration among Indian smartphone users and has displaced SMS; the customer will
  not install an app, so the customer's entire experience arrives on WhatsApp.
- ~95% of Indian smartphones are Android, and the technician's device is routinely sub-₹10,000 with an
  LCD panel, not AMOLED.
- GST 2.0 collapsed the slabs to 5%/18% (+40% de-merit) effective 22 Sep 2025, so tax rates must be an
  effective-dated table rather than constants — a re-architecture for anyone who hardcoded them.

### 3. Information architecture — derived from the business

The nine primary destinations and their order are set in `src/lib/navigation.ts` with §6.2's per-position
rationale. **How this IA differs from the reference (`obizee-dashboard`)** — mandatory line, and it is a
real difference rather than a restatement:

> The dashboard's IA is **commerce-shaped**: Overview → Sell (Orders, Create order, Products) →
> Operations (Shipping, Inventory) → Procurement → Finance → Growth. Its second group is *selling
> things*, and inventory sits high because a trading business lives on stock.
>
> This product's IA is **job-shaped**: Overview (Today) → Work (Jobs, Leads, Contracts, Customers) →
> Money → Operations (Parts) → Insights. **Parts sits seventh, deliberately**, where the dashboard puts
> Inventory second. A service firm's owner opening a product whose second item is Inventory concludes,
> correctly, that it was built for a trading business and adapted. The shell is inherited; the hierarchy
> is not.

### 4. The primary screen must carry the whole story — the four mandatory beats

`futuristic-product-build` Translation 1: the primary post-login screen replaces the marketing
homepage's four beats with their operational equivalents. Recorded here as required, with the section
that will satisfy each.

| Marketing beat | Product-mode equivalent | Section on this screen |
|---|---|---|
| About the brand | **State of the business right now** — the handful of numbers that say whether today is normal | **Today in one line**: jobs scheduled / done / unassigned, cash collected today, overdue receivables. Landed instantly, no interpretation. |
| Why this brand | **What needs me** — the exceptions waiting on *this* user, by role. A queue with actions, not a feed | **Needs your call**: 1–2★ ratings (FR-1205), leads with 3+ missed follow-ups (FR-104), jobs stuck in `PARTS_AWAITED`, SLA breaches (FR-207), unsettled technician cash. |
| Quantitative analysis | **Trend and comparison** — the same numbers against last period, because a number without a comparison is a support ticket | **Against last week**: jobs completed, first-visit-fix rate, average time-to-sign-off, collections. |
| Strategy & market position | **Where this is heading** — the forward-looking view that turns record-keeping into decision-making | **Coming up**: receivables ageing, AMC renewals due (FR-506), contracts under-delivering visits, tomorrow's load. |

**Sequence:** situation → what needs me → is that good or bad → what's coming. Same conviction arc as a
homepage, different content.

**Role-awareness is required, not optional.** §6.2 gives the Owner *Owner Home* on mobile and *Today* on
web; the Coordinator lands on *Today*; the Accountant lands on *Invoices & Payments*. A warehouse user's
"what needs me" is not the owner's — so this screen resolves its four sections per role rather than
shipping one dashboard for everyone.

### 5. The single point this screen must land

> **"Here is what is wrong today, and here is the one thing to do about it."**

If the user has to think about *where to look*, the screen has failed — §3.1 names that as the exact
moment the owner abandons the product. The second abandonment trigger is a home-screen number
disagreeing with what the accountant read out, which is why every figure on it must drill through to the
records it was computed from, and why `Computed<T>` renders an em-dash rather than a zero when a source
is down.

---

## GATE 2 — What "futuristic" means for THIS brand

Required before any pixels. `futuristic-web-build` Gate 2: name the levers used **and not used**.
`futuristic-product-build` Translation 2 reframes the target: on a data-dense operator screen, "wow" is
**speed and anticipation**, not animation — "operators say wow about work they did not have to do".

**The constraint that shapes every lever:** this screen is inherited chrome. It must read as oBizee, on a
1366×768 laptop and a ₹18,000 Android, for a 44-year-old owner in a car. Anything that reads as a design
exercise is wrong here.

### Levers used

| Lever | How, specifically |
|---|---|
| **Restraint** | The primary lever. Four sections, one screen, no tabs, no carousel, no configurable widgets. Every element earns its place by answering one of the four beats. A dashboard the owner can rearrange is a dashboard nobody tuned. |
| **Typographic tension** | The only real visual drama: `text-counter`-scale numerals against 14px labels, tabular figures aligning down every column. On a money screen the numbers *are* the design. |
| **Anticipation (the "wow")** | The screen has already done the arithmetic the owner was about to do in his head — "3 jobs unassigned, ₹2.4L overdue past 45 days, 2 AMCs under-delivering". Not a chart to interpret; a conclusion with a link to its evidence. |
| **Depth used structurally** | Elevation separates "needs action" from "for information" — the `Needs your call` block is the only elevated surface. Depth as hierarchy, not atmosphere. |
| **Motion with intent** | 120ms press feedback, 180ms state change, and **the sync indicator, which is the only thing permitted to animate indefinitely** because a static "Syncing…" is indistinguishable from a hung process. |

### Levers explicitly NOT used, and why

| Rejected | Why |
|---|---|
| Dark + gradient "futuristic" | Fights the warm oBizee palette, and §3.3's LCD-in-daylight reality wants maximum luminance. |
| Hero animation, parallax, decorative loops | §6.13.8 forbids them outright. |
| **KPI count-up animation** | §6.13.8 forbids it specifically: an owner reading a money figure that is still animating reads a **wrong number**. |
| List entrance / staggered reveals | Forbidden — costs 300–600ms of perceived latency on a sub-₹10,000 device for zero information. |
| Charts on this screen | §6.14 permits charts **on the Reports screen only**, each with the table it was drawn from. The primary screen states conclusions, not trends to squint at. |
| A configurable widget grid | Anticipation is the lever; asking the user to build their own dashboard is the opposite of it. |
| Drag-to-reorder, hover-reveal, kebab-only menus | §2.2 lists hidden navigation as a non-goal — it "reads as a **missing feature** to this user base". |

---

## GATE 3 — Content first, then compose

**How the registry was shopped without web access.** The session's web-search budget was exhausted, so
candidates were found with the shadcn CLI itself — `shadcn search @shadcn --query …` across the
component families (card, item, empty, table, progress, alert, chart, dashboard, list), then
`shadcn view` to read each candidate's actual source before choosing. That is a stronger shortlist than
browsing screenshots, because the decision was made against the real component API.

⚠️ **A LAW #2 miss found while shopping, and corrected.** `@shadcn/empty` exists — a purpose-built empty
state with `Empty / EmptyHeader / EmptyMedia / EmptyTitle / EmptyDescription / EmptyContent`. Phase 0's
`EmptyState` was hand-rolled instead, which is exactly the laziness LAW #2 targets. Rebuilt on the
imported component.

### 3.1 — Content and data contract, written before any component was chosen

The screen answers four questions in sequence. Copy below is the real copy, not placeholder.

**Section A — "Today" · the one decision: *is today normal?***

| Tile | Value | Hint |
|---|---|---|
| Jobs today | `18` | `12 done · 4 in progress · 2 not started` |
| Unassigned | `3` | `oldest waiting 2h 10m` |
| Collected today | `₹1,24,500.00` | `6 payments` |
| Overdue | `₹3,12,400.00` | `9 invoices · oldest 74 days` |

Every tile is a **count plus its composition**, never a bare number — a bare "18" makes the owner open
another screen, which is the failure this beat exists to prevent. `Overdue` and `Collected` are
`Computed<Paise>`, so a failed ledger read renders an em-dash rather than a plausible ₹0.

**Section B — "Needs your call" · the one decision: *what is stuck, and what do I do about it?***

A queue with an action per row, not a feed. Sources, in severity order: a 1–2★ rating (FR-1205, escalates
within 60s), a lead with 3+ missed follow-ups (FR-104), a job stalled in `PARTS_AWAITED` (FR-208), an SLA
breach (FR-207), unsettled technician cash (FR-902). Row copy is a **sentence naming the person and the
consequence**, because "SLA breach ×1" is not actionable at 9am:

> *"Mrs. Deshpande rated Ramesh 1 star — 'Left dirty'"* → **Call**
> *"Sunil Traders — 3 missed follow-ups, last contact 12 days ago"* → **Open lead**
> *"J-2607-0398 waiting on a 45 MFD capacitor for 6 days"* → **Schedule revisit**

Empty copy: *"Nothing needs you right now."* → **See today's board** · orientation *"14 jobs scheduled for
tomorrow, 5 still unassigned."* — §6.3's three parts, and the orientation line points at the next real
thing rather than congratulating.

**Section C — "Against last week" · the one decision: *is that good or bad?***

Four comparisons — jobs completed, first-visit fix rate, average time to sign-off, collected. Each
carries **a word and an arrow**, never colour alone (§6.13.4), and "better" is stated explicitly because
a falling number can be good (time-to-sign-off) and a rising one can be bad.

**Section D — "Coming up" · the one decision: *what is heading at me?***

Receivables ageing across §5.9's buckets, AMC renewals inside 45 days (FR-506), contracts
under-delivering their committed visits, and tomorrow's load with its unassigned count.

**Data contract:** one `HomeSnapshot` zod schema, validated at the boundary, fixture today and API later
(DR-9). Money is `Paise`; anything a service could fail to compute is `Computed<Paise>`.

### 3.3 — Shortlists (≥3 real candidates per section, from the registry)

| Section | Candidates considered | Chosen | Why the others lost |
|---|---|---|---|
| A — Today | `@shadcn/card` · `@shadcn/table` · `@shadcn/chart` · `@shadcn/dashboard-01` (block) | **card + badge** | `table` is wrong for four figures with no columns. `chart` is banned here — §6.14 permits charts on Reports only. `dashboard-01` is a whole-page block that would drag in its own sidebar and layout, fighting the shell inherited from the dashboard. |
| B — Needs your call | `@shadcn/item` · `@shadcn/table` · `@shadcn/alert` · `@shadcn/card` | **item + button + empty** | `table` implies columns that scan vertically; these rows are heterogeneous sentences. `alert` stacks poorly at five rows and shouts equally at every severity. `Item` gives media/content/actions slots and `role="list"` for free. |
| C — Against last week | `@shadcn/card` · `@shadcn/chart` · `@shadcn/progress` · `@shadcn/table` | **card + badge** | `chart` banned (§6.14). `progress` implies a target, and "jobs completed vs last week" has none. |
| D — Coming up | `@shadcn/progress` · `@shadcn/item` · `@shadcn/table` · `@shadcn/card` | **card + item + progress** | `progress` earns its place *here* because contract visit delivery genuinely is `3 of 12` against a committed total — the one place a bar states a fact rather than decorating one. |

### 3.4 — Composition and count

Four sections, **2–3 imported registry components each**, all inside LAW #2's 1–4. Nothing is
hand-rolled that the registry supplies: `Card`, `Badge`, `Item`, `Button`, `Empty`, `Progress`,
`Separator`. The only bespoke code is the arrangement and the domain copy — which is the part that
cannot be imported.

**Reuse justified:** `Card` appears in three of four sections. §6.13.7's density contracts and the
dashboard's own `KpiCard` both assume the card as the unit of grouping, and introducing a second
container idiom on the product's most-viewed screen would read as two design systems. Variety is served
by what sits *inside* the cards, not by inventing containers.

## GATE 4 — Originate

What this screen has that the reference (`obizee-dashboard`'s home) does not:

1. **A "what needs me" queue.** The dashboard's home is `financial-overview` + `order-status-grid` +
   `top-products` — three *reporting* blocks. Nothing on it produces an action. `NeedsYourCall` is a
   queue where every row is a sentence naming a person and a consequence, ending in one labelled button.
   This is the section that makes the screen an operator's tool rather than a report, and it is the beat
   the reference has no equivalent for.
2. **A number that refuses to lie.** The reference's `MoneyText` does `amount ?? 0`, so a failed lookup
   renders as a genuine ₹0. Here `Computed<Paise>` has no value in its failure branch, so `Overdue`
   renders an **em-dash beside "9 invoices · oldest 74 days"** — the count is known, the amount is not,
   and the screen says exactly that.
3. **`better` decoupled from `direction`.** Time-to-sign-off falling is good; collections falling is bad.
   Deriving good/bad from the arrow would get one of them wrong, and an owner who catches the product
   calling a good week bad stops trusting every other number on it.
4. **A partial failure shown by default.** The fixture ships the ledger down, so the degraded path is
   visible on every load in review rather than discovered in production.

## GATE 5 — Legibility

- **Nothing below 12px** — `text-xs` is the floor and carries only hints, never a status word or money.
- **Tabular figures on every numeral** — counts, money, percentages, durations, job numbers. The ageing
  column aligns down its decimal.
- **Amounts never truncate.** Customer names may (`truncate` on the contract row); figures may not.
- **Every status carries a word and a shape**, not colour alone — the comparison badges pair an arrow
  with "4 more" / "0.7 days faster", and the attention rows carry an icon per kind.
- ⚠️ **Contrast is below §9.6's 7:1 floor by decision (DR-13)**, so this gate passes on its structural
  rules while the numeric floor is knowingly unmet. Recorded, not glossed.

## GATE 6 — Audit

Screenshotted at **1366×768** (the coordinator's actual laptop) and at 1366×1560 for the full page.

### Iteration 1 — FAILED

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Font | 8 | Inter throughout; tabular figures align down every numeric column; hierarchy reads 2xl title → card title → 2xl KPI → sm label → xs hint without ambiguity. |
| 2 | Color | 7 | Warm oBizee palette; orange reserved for brand, active nav and the progress fills; status tone carries meaning (green better, amber worse). Marked down: the KPI icon chips use `bg-primary/10` decoratively, which is a fifth use of primary beyond §6.13.2's four — inherited verbatim from the dashboard's `KpiCard`, so consistent with DR-13 but not with §6.13.2. |
| 3 | **Background** | **6 — FAIL** | All four cards render identically flat. Gate 2 committed to "elevation separates *needs action* from *for information* — the Needs your call block is the only elevated surface", and it wasn't. The one block that produces an action carried no more visual weight than the two that only report. |
| 4 | Visibility | 7 | Em-dash renders correctly; hints legible; amounts right-aligned. Contrast below §9.6 by DR-13. |
| 5 | Impact | 8 | "18 jobs / 3 unassigned / ₹1,24,500 collected / — overdue" lands the state of the day in one row, above the fold. |
| 6 | User empathy | 8 | Every attention row ends in a labelled action; the partial notice names what still works; comparisons show "was X". |
| 7 | Wow | 7 | Product-mode wow is anticipation: "oldest waiting 2h 10m", "stalled 6 days", "0.7 days faster", "3 of 12 visits" — arithmetic the owner would otherwise do himself. |

**Average 7.29, but Background at 6 fails the gate.** Reworked rather than argued.

### Rework

`NeedsYourCall` given `border-l-4 border-l-primary shadow-md`. Depth used **structurally**: a raised
surface plus a brand-coloured left edge marks the only block that produces an action. The left edge is
also a **shape** channel, so the distinction survives greyscale and a washed-out panel — which matters
more under DR-13, not less.

### Iteration 2 — PASS

| # | Dimension | Score | Change |
|---|---|---|---|
| 1 | Font | 8 | — |
| 2 | Color | 7 | — |
| 3 | **Background** | **8** | The action block is now unmistakably the action block; reporting cards stay flat. Hierarchy matches the stated intent. |
| 4 | Visibility | 7 | — |
| 5 | Impact | 8 | Improved by the same change — the eye lands on the actionable block after the KPI row. |
| 6 | User empathy | 8 | — |
| 7 | Wow | 7 | — |

**Average 7.57 · every dimension ≥ 7 · PASS.**

### Defects found by rendering, not by static checks

- **"Good morning, Priya" at 11:47 pm.** The greeting was hardcoded. A small lie on the most prominent
  line of a screen whose entire claim is that its numbers are trustworthy — and the coordinator covering
  a Sunday evening shift would see it every time. Replaced with `greetingFor()`, resolved in IST like
  every other formatter, with four tests including one pinned at 23:45.

### Known gaps, carried forward rather than hidden

- **Role-awareness is specified but not yet implemented.** The screen renders as the coordinator. §6.2
  gives the Owner *Owner Home* on mobile and *Today* on web, and the Accountant lands on Invoices — so
  this screen must resolve its four sections per role. Deferred to the role-routing work, not silently
  dropped.
- **No mobile pass.** `futuristic-web-mobile` runs last with desktop frozen, per the phase plan.
- 🚫 **Status ceiling 🟡 `UI-complete · backend suspended`** (DR-9). Every figure here comes from a
  fixture; nothing is GREEN.

**Not blocked.** The conventions were read from `obizee-dashboard` source and mirrored into
`src/components/shared/` — `kpi-card`, `money-text`, `page-header`, `status-badge`, plus `app-sidebar`
and `top-bar` in `src/components/shell/`. Card treatment, section rhythm, header scale, tone classes and
the icon-chip pattern all came from there.

**Architect's note, recorded so the mistake is not repeated.** A rendered walkthrough of the dashboard
was proposed as extra fidelity and then pursued across several turns — a login that required the client
to start a backend, an env file the permission layer refused to move, and an account belonging to a
different product with a different identity domain (DR-15). It was optional from the start and the
source read had already delivered it. **Cost the client four turns for nothing.** When the reference is
a codebase in the same repo, read the components; only ask for a rendered walkthrough when something
genuinely cannot be inferred from source, such as real-data overflow behaviour.

---

# Phase 2 — Today, the dispatch board (§6.4)

## GATE 1 · 2 — inherited

The brief and the futuristic levers are unchanged from Phase 1 and are not re-derived. What differs is
the **job**: this screen answers *which unassigned or stuck job do I act on in the next two minutes, and
who do I give it to?* It is **not a dashboard** — a work queue with the supply side beside the demand
side. Its user is §3.2's coordinator, who is 80% of all keystrokes in the product and is on a call while
using it.

## GATE 3 — Content and composition

**Content first.** The five counters, every field in a job row, and the technician panel's contents are
enumerated in `src/lib/data/board.ts` as a contract before any component was chosen. Two contract
decisions come straight from §6.4:

- **The counters are a closed union of *filters*,** not statistics. §6.4.1 rejects a "Total jobs today"
  counter by name as "a number nobody acts on" — modelling `BoardFilter` as a closed set means a sixth
  counter is not expressible without a deliberate contract change.
- **`visit` is nullable, never defaulted.** §6.4.5 requires `Visit —/—` with a tooltip when contract data
  fails and forbids `Visit 0/0`, because a fabricated zero reads as a contract with no visits delivered.

**Shortlist** — `@shadcn/table` · `@shadcn/item` · `@shadcn/card` · `@shadcn/badge` · `@shadcn/empty`.
**Chosen: card + badge + button + empty.** `table` lost despite being the obvious pick: a semantic table
imposes a uniform cell grid, and §6.4.2's row is two lines of heterogeneous content at a **fixed 44px**.
`Item` lost here (though it won on the home screen) because its `gap-4` group rhythm and content-driven
height fight a fixed-height row budget.

**Composition: 4 imported components**, inside LAW #2's 1–4.

## GATE 4 — Originate

- **The counters are filters.** Most dispatch boards render these as read-only stats. Making each one a
  `<button aria-pressed>` that narrows the list — with a removable chip so a coordinator who filtered two
  minutes ago cannot mistake a partial board for a complete one — is the difference between a report and
  a work queue.
- **Two distinct empty states.** True-empty and filtered-to-zero get different sentences and different
  buttons, because §6.4.5 is right that "the user's mistake is different".
- **The overload warning warns and does not prevent** (FR-204): "MSME dispatchers routinely and correctly
  overload a technician who is already in that building."
- **`Visit —/—`** — a partial failure rendered honestly inside a row.

## GATE 5 — Legibility

12px floor on line 2; tabular figures on slot, job number, counts and durations; job number is
`select-all` so it copies in one gesture for reading aloud; localities hold their width and the service
type absorbs the squeeze.

## GATE 6 — Audit

**Density contract verified numerically, not by eye** — the measurement §6.4.4 calls "the binding density
constraint for the whole product":

| Measure | Required | Actual |
|---|---|---|
| Row height | 44px | **44px** |
| Rows fully above the fold at 1366×768 | 10 guaranteed, 11 target | **12** |

### Iteration 1 — FAILED (Visibility 6)

`"Shakti Industries"` — a 17-character customer name — truncated to `"Shakti Ind…"`, because the priority
flag shared line 1. §6.4.2 puts the customer in the row for **recognition** ("regular customers get
different treatment"), and an ellipsis defeats exactly that.

### Rework

Priority moved to line 2 with the other qualifiers. That shifted the squeeze onto locality and service,
so locality was given a fixed max-width and the **service type made the element that absorbs it** —
when the row is tight, knowing *where* beats knowing *what*, because locality is what makes two jobs
clusterable and the service type is one click away in the drawer.

### Iteration 2 — PASS

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Font | 8 | 14/18 line 1, 12/16 line 2 inside a fixed 44px; tabular figures throughout. |
| 2 | Color | 8 | Status pills and SLA chips carry meaning; `[Assign]` is the only primary fill on the screen (§6.4.6, defect D7). |
| 3 | Background | 8 | Card-grouped list against warm canvas; sticky column header on `bg-muted/50`; technician panel scrolls independently. |
| 4 | **Visibility** | **8** | Only two strings still ellipsise: a genuinely long customer name (§9.6 permits names to) and the service type on two priority rows (deliberate, documented). Localities no longer truncate. |
| 5 | Impact | 9 | The three unassigned rows carry the only orange fills on the screen; the eye goes straight to the work that has no owner. |
| 6 | User empathy | 8 | Assignment shows both sides at once; the overload warning warns without blocking; the technician on leave is visible but not assignable. |
| 7 | Wow | 7 | `On site since 11:42` and `Today in Okhla Phase II · Saket · Karol Bagh` — the panel has already worked out whether he is nearly free and whether the next job is on his way. |

**Average 8.0 · every dimension ≥ 7 · PASS.**

### Known gaps

- Drag-and-drop assignment is offered by §6.4.3 as an **accelerator**; the labelled `[Assign]` path is
  built and is the one §6.4.3 requires ("never the only path"). Drag is deferred, not dropped.
- The date stepper and Today/Tomorrow/This week segments are present but do not re-query — there is one
  fixture day under DR-9.
- 🚫 Status ceiling 🟡 `UI-complete · backend suspended`.

---

# Phase 2b — Job detail (§6.5)

## GATE 3 — Content and composition

**Content first.** `src/lib/data/job-detail.ts` encodes §6.5.1's above-the-fold set as a contract before
any component was chosen, and three fields exist because the spec argues for them specifically:

- **`statusSince`** — status carries an elapsed duration because *"'On site since 11:42' answers the
  question she is about to be asked on the phone. A bare 'On site' does not."*
- **`visit`** — `Visit 3 of 12` tells her whether the visit is contractually owed, *"which changes
  whether she is allowed to bump it"*.
- **`asset.warrantyTo` / `repeatFailure`** — above the fold because the answer to "is this still under
  warranty?" changes **what she is allowed to charge**.

**Shortlist** — `@shadcn/card` · `@shadcn/item` · `@shadcn/table` · `@shadcn/separator` · `@shadcn/badge`.
**Chosen: card + separator + badge + button.** `item` lost: the timeline needs a continuous rail, and
`Item`'s bordered-row rhythm reads as a list of separate objects rather than one append-only sequence.
`table` lost for the same reason it lost on the board — heterogeneous content, not a cell grid.

## GATE 4 — Originate

- **`primaryActionFor(status)` is a pure, tested function.** §6.5.3 promises "exactly one, always the
  same colour and position, so muscle memory works" — muscle memory only forms if the mapping is stable,
  so the whole table is pinned by tests including the two states that deliberately return **null**
  (`PAID`, `CLOSED`: follow-up is "secondary only; no primary", because offering a primary action on a
  finished job invents work).
- **Offline provenance is rendered.** Timeline events carry `recorded offline` with an icon — §4.2 rule 3
  requires the flag, and §9.2 makes `occurred_at` authoritative, so the office can see that a technician
  who finished at 4pm in a basement did the job at 4pm even though it synced at 7pm.
- **A pending signature reads as normal, not as an error.** §6.5.2 notes this "occurs many times a day",
  so it renders as muted text inside the sign-off block rather than as an alert.

## GATE 5 — Legibility

Landmark on its own line and bolded — "a landmark is how an Indian address is actually resolved". Every
contact carries a role label; no bare phone numbers. `tnum-id` (tabular + slashed zero) on the job number
and the asset serial, where 0/O confusion has a real cost.

## GATE 6 — Audit

Verified in browser against the live fixture: status `PARTS_AWAITED` renders **"Schedule revisit"** as the
sole primary action, top-right, with Call site / Reassign / Reschedule secondary — matching §6.5.3's row
for that state exactly.

### Iteration 1 — FAILED (Visibility 6)

The partial notice ("Service history unavailable") rendered **full-bleed** while the content sat in a
constrained container, so a notice referring to the asset block was visually detached from it.

### Rework

The container now wraps the boundary rather than sitting inside it, so notices and errors align with the
content they describe.

### Iteration 2 — PASS

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Font | 8 | Clear hierarchy; tabular figures on dates, times, pincode, serial and job number. |
| 2 | Color | 8 | Repeat-failure in a destructive tint; primary fill used once, on the state's action. |
| 3 | Background | 8 | Cards group WHERE / ASSET / TIMELINE / PARTS / SIGN-OFF; the access note sits on `bg-muted` as a distinct callout. |
| 4 | **Visibility** | **8** | Notice now aligned with its content; nothing truncated inappropriately. |
| 5 | Impact | 8 | Status + elapsed duration is the first thing read; the one primary action is unmissable top-right. |
| 6 | User empathy | 9 | Landmark on its own line, access notes surfaced, role-labelled contacts with one-tap call/WhatsApp, honest empty copy on both sub-blocks. |
| 7 | Wow | 8 | The repeat-failure warning and the offline markers are work the coordinator would otherwise do by asking someone. |

**Average 8.14 · every dimension ≥ 7 · PASS.**

### Deferred, recorded rather than dropped

- **The 640px drawer over a dimmed board.** §6.5 wants this both as a drawer from the board *and* as a
  full page at its own URL. The URL half is built and the board links to it; the drawer needs a parallel
  + intercepting route restructure of the board layout, and Next 16 fails the build without an explicit
  `default.tsx` per slot. A presentation change over content that is already correct.
- Action-bar buttons other than the primary are not yet wired — DR-9.
- 🚫 Status ceiling 🟡 `UI-complete · backend suspended`.

---

# Phase 2c — Leads, the follow-up queue (§6.6)

## GATE 3 — Content and composition

**The one decision:** *who do I call right now?* §6.6.1's claim drives the whole screen: **"a lead's stage
does not tell you who to call today. Only the follow-up date does."** A kanban with 60 cards forces
scanning every column and opening cards to find dates — so the default is a dated queue and the stage
board is a second **always-visible tab** ("the view choice is never a dropdown").

`UNASSIGNED` is pinned **above** `OVERDUE`, encoded in the group order itself: "a lead with no owner is a
worse failure than a lead whose owner is late — nobody is even responsible for it."

**Shortlist** — `@shadcn/table` · `@shadcn/item` · `@shadcn/card` · `@shadcn/popover` · `@shadcn/empty`.
**Chosen: card + popover + badge + button** (4, inside LAW #2). `popover` earns its place on the spec's
own instruction: Log outcome is "a **320px popover, not a page**", because sending a coordinator to a
detail screen and back for every call is the cost the queue exists to avoid.

## GATE 4 — Originate

- **The queue can be worked without a mouse.** Saving an outcome moves focus to the next row (§6.6.3), so
  20 leads can be cleared from the keyboard. `N` opens New lead, and **the shortcut is printed on the
  button** rather than buried in a help page.
- **The mandatory next follow-up is pre-filled at +2 days** and Save is disabled without it — FR-104
  blocks the save with the reason in words: *"a lead without a date gets forgotten."*
- **Row-level partials.** One lead's activity lookup failed: that row reads "Activity unavailable" and
  stays fully actionable, while every other row is unaffected. A failed quoted value renders `—`,
  **never ₹0** (§6.6.4).
- **`takenBy` shown only when it differs from the owner.** FR-103 keeps both because "MSMEs pay incentives
  on the first and manage on the second" — and that distinction only carries information when they
  disagree.

## GATE 6 — Audit

| Measure | Required | Actual |
|---|---|---|
| Row height | 52px (not 44 — "the last-activity line earns its space") | **52px** |
| Rows above the fold @1366×768 | target 8 | **8** normally · **6** while a partial-failure notice is showing |

The notice costs exactly two rows (114px), measured. That is a deliberate trade — a banner explaining
which data is missing is worth two rows — and it is recorded rather than smoothed over, because the
fixture ships that failure on every load and the 6 is what a reviewer will actually see.

### Iteration 1 — FAILED (Visibility 6)

Two defects, both found by measuring rather than looking:

1. **`takenBy` was invisible at 1366px** — gated at `2xl` (1536px), which breaks defect **D6**'s own
   resolution that it must be "a persistent column at ≥1280px" because §6.13.9 forbids hover-only
   affordances and §3.2's coordinator is on a touch laptop.
2. **`"Unassigned · took System"` overflowed its column** — and said nothing worth the space, since an
   unassigned lead's message is that nobody owns it.

### Rework

`takenBy` merged into the owner column at `xl`, rendered only when an owner exists *and* differs. Page
chrome tightened to recover the rows the header and tab strip were taking.

### Iteration 2 — PASS

| # | Dimension | Score | Evidence |
|---|---|---|---|
| 1 | Font | 8 | Two-line 52px row; tabular figures on money, dates and counts. |
| 2 | Color | 8 | Stage pills carry the tone vocabulary; the only primary fill is `[+ New lead]`, which §6.6.5 says outranks everything in the list. |
| 3 | Background | 8 | Grouped cards with collapsible headers; `Later` collapsed by default because it is not today's work. |
| 4 | **Visibility** | **8** | Zero truncation at 1366px; `—` for the failed value; "Activity unavailable" in place of the missing note. |
| 5 | Impact | 8 | `Unassigned (1)` sits above `Overdue (2)`; the queue order *is* the answer to the screen's question. |
| 6 | User empathy | 9 | Call and WhatsApp are in the row — "the action *is* the phone number", and requiring a click into a detail page "adds a step to the most repeated action in the product". |
| 7 | Wow | 8 | The last-activity line means she never opens the record before dialling — §6.6.2 calls it "the highest-value element in the row", and it is the work she does not have to do. |

**Average 8.14 · every dimension ≥ 7 · PASS.**

### Deferred

- The **Pipeline** tab renders a placeholder explaining what it is for. It is the owner's Monday review,
  not the daily screen, and building it now would be scope ahead of value.
- Outcome saves are local state — DR-9.
- 🚫 Status ceiling 🟡 `UI-complete · backend suspended`.

---

# Phase 2d — New lead (§6.7, FR-101 · FR-102 · FR-103 · FR-104 · FR-105)

## GATE 3 — Content

**The one decision:** *do I have enough to call this person back?* — **not** "is this record complete".
§6.7.1 justifies all ten fields *and* the exclusions, and the exclusions are the sharper half: GSTIN,
full site address, billing address, email, expected value and asset details are absent because "each of
these, asked here, **measurably loses leads**". Asking a prospect for a GSTIN on the first call is
absurd; asking for a full address costs "40 seconds she does not have".

FR-101's contract is the acceptance test: submittable with **exactly** a 10-digit phone, a name, one
source chip and one service chip.

**Composition: dialog + input + button + popover-free chips** — 3 imported components. Chips are plain
buttons rather than a select, on the spec's own reasoning: "a dropdown costs open-scroll-select while the
phone is ringing".

## GATE 4 — Originate

- **The duplicate panel fires on the 10th digit**, not on blur — she may never leave the field, and
  FR-102 wants the answer while the customer is still talking.
- **Two different matches, two different primary actions.** An existing *customer* offers "Create job for
  this customer" (there is no sales cycle to run); an existing open *lead* makes "Open existing lead" the
  primary, so she cannot create a second lead for the same caller.
- **The resting state renders nothing at all.** §6.7.2 is explicit that "No customer found" reads as an
  error — verified in browser with an unmatched number.
- **`Referred by` appears only for `Referral`, and is then required** (FR-105): "referral incentives
  cannot be paid to an unnamed person."
- **Free-text service always available** — "an unlisted service must never block capture."
- **Follow-up defaults to Tomorrow and cannot be empty** (FR-104), offered as chips because "a date
  picker is four interactions".
- **`Ctrl/Cmd+Enter` saves**, and an 8-second toast carries the new reference with Undo (FR-101).

## GATE 5 — Legibility

`type="tel"` + `inputMode="numeric"` so the phone field opens a keypad — §6.13.9 calls a QWERTY keyboard
on a numeric field a defect. Tabular figures on the number. "+91 assumed" stated rather than left to be
discovered.

## GATE 6 — Audit

**Verified live, all three FR-102 branches:**

| Input | Panel |
|---|---|
| `9811022334` | Mrs. Deshpande · 7 past jobs · last 1 Aug 2026 · 1 open · Outstanding ₹4,500.00 → **Create job for this customer** |
| `9811077889` | Already an open lead · `L-2608-0149` · QUOTED · 12 days late → **Open existing lead** |
| unmatched | **nothing rendered** — resting state silent, confirmed by asserting no "no match"/"not found" text exists |

### Pre-audit fix

Lint caught a synchronous `setState` inside the lookup effect (resetting the panel when the number fell
below 10 digits). Rather than suppress the rule, the panel's visibility was made **derived** from the
digit count — which is both correct React and exactly §6.7.2's resting-state rule expressed once.

| # | Dimension | Score |
|---|---|---|
| 1 | Font | 8 |
| 2 | Color | 8 |
| 3 | Background | 8 |
| 4 | Visibility | 8 |
| 5 | Impact | 8 — phone first, panel inline directly beneath it |
| 6 | User empathy | 9 — chips over dropdowns, conditional required field, free-text escape hatch, defaulted follow-up, keypad |
| 7 | Wow | 8 — the panel answering "have we met this person?" mid-dial is work she would otherwise do by searching |

**Average 8.14 · every dimension ≥ 7 · PASS.**

### ⚠️ The requirement this screen cannot prove

FR-102 is a **latency** requirement: the panel must appear within 500ms of the 10th digit on a p95 ≤250ms
lookup. A fixture returns instantly and always succeeds. **The behaviour is built; the budget is
unproven**, and it stays unproven until the backend phase. Recorded here and in the registry rather than
counted as met — this is exactly the class of requirement DR-9 cannot validate.

- 🚫 Status ceiling 🟡 `UI-complete · backend suspended`.

---

# Phase 3 — Owner Home (§6.10), mobile-first at 390px

## GATE 3 — Content

**The one decision:** *is anything on fire, and if so what do I pick up?* The owner is "an **exception
handler, not a report reader**", so this is "a triage list with two numbers on top, not a dashboard".

**The exclusions are the design.** §6.10.1 keeps revenue charts, technician leaderboards, month-to-date
totals, pipeline value and AMC renewal counts *off* this screen — all real, all one tap down under
Review — because "a chart cannot be acted on from a car". And **there is no create action at all**
(§6.10.3): the owner does not do data entry.

**"Needs your call" is capped at three by the schema**, not by convention: §6.10.1 says "an owner
presented with 20 problems addresses none", so `z.array(callRowSchema).max(3)` makes a generous backend
unable to widen it.

## GATE 4 — Originate

**The distinction this screen is built around**, and the reason `Computed<Paise>` exists at all:

> §6.10.2 — *"A false zero on the owner's money tile is the most damaging bug in this product."*

…paired with its opposite: on a genuinely quiet day the tile **should** read `₹0.00`, "this is a true
zero and is correct to show". Two states that must never look alike:

| State | Renders |
|---|---|
| Quiet day, real zero | **₹0.00** |
| Aggregate failed | **—** plus "Couldn't load overdue total" and a retry **on that tile alone** |

A plain `number` cannot express that difference; the failure branch of `Computed<Paise>` carries no
number to render, so the bug is unrepresentable rather than merely avoided.

Also built: the **brand-new-tenant state is a different screen entirely** — a three-step setup list with
progress, because "an owner on day one must not see a screen of zeros". Zeros only mean something once
there is a business behind them.

## GATE 6 — Audit

### Iteration 1 — FAILED (Visibility 6)

🔴 **A §6.13.1 violation, found only by looking at 390px.** The brand lockup lives in the sidebar header,
and below 1024px the sidebar collapses into a sheet — so **the brand disappeared from the screen
entirely**. §6.13.1 requires the name and logo to be "always visible" in operator chrome and "present on
every screen". Inherited straight from the dashboard's shell structure, which has the same shape.

Two layout defects alongside it: the failed-tile message wrapped to four lines at 390px because the retry
button shared its row, and a call row's reason truncated to "Waiting on a 4…" — which destroys the only
part of the row that says *why* to call.

### Rework

Lockup added to the top bar at `lg:hidden`, at §6.13.1's mobile size (20px mark, wordmark never dropped).
Failure message given its own line above the retry. Call reasons switched from `truncate` to
`line-clamp-2` — §9.6 lets a *name* ellipsise; the reason for a call may not.

### Iteration 2 — PASS

Above-the-fold contract measured at 390×844 against §6.13.7's row ("Money pair + 3 counters + progress +
1 call row"): money pair ✅ · 3 counters ✅ · progress ✅ · **2 call rows** (needs 1) · lockup ✅.

| # | Dimension | Score |
|---|---|---|
| 1 | Font | 8 — 28px money, 34px counter numerals, 14px labels, exactly §6.10.1's scale |
| 2 | Color | 8 — only the **first** Call is filled; §6.10.3 makes that the screen's single primary |
| 3 | Background | 8 |
| 4 | **Visibility** | **8** — lockup restored, nothing meaningful truncated |
| 5 | Impact | 9 — the two money numbers "an owner checks compulsively" are the first thing on the screen |
| 6 | User empathy | 9 — three-row cap, every counter a link into the filtered list, retry scoped to the one tile that failed, no data entry asked of him |
| 7 | Wow | 8 — the counters are framed as "things where **someone has stopped doing their job**", which is a judgement the product makes so the owner doesn't have to |

**Average 8.29 · every dimension ≥ 7 · PASS.**

- 🚫 Status ceiling 🟡 `UI-complete · backend suspended`.

---

# Cross-screen QA pass — real Chrome, 1366×768

Run in the user's actual Chrome rather than the embedded preview. The embedded browser scales its
screenshots down, which hides button-weight and truncation defects; at full resolution three real
problems surfaced immediately, **all of them "one primary per screen" violations of §6.13.2** that had
survived four individual screen audits.

| Screen | Defect | Fix |
|---|---|---|
| Today board | **Four filled `Assign` buttons.** §6.4.6 is singular — "[Assign] on the **highest-priority unassigned row**… nothing else on this screen is styled as a primary button." Four primaries destroy "the only cue that tells a hurried user where to go" (§6.13.2). | Only the highest-priority unassigned row (breakdown > urgent > normal) renders filled; the rest are outline. |
| Leads | **`Call` and `WhatsApp` were icon-only.** §6.6.3 specifies "three **labelled** controls", and §6.13.10 permits a bare icon only where "a labelled equivalent [exists] elsewhere on the same screen" — there was none. | Both given text labels. `Repeat customer` also widened out of an ellipsis. |
| Home (`/`) | **No primary at all** — every action outline, so nothing indicated where to start. | First attention row's action is filled; rows are pre-sorted by severity, so the first row is by construction the one to act on. |

**Deliberately left icon-only:** the per-contact call/WhatsApp buttons on Job detail. §6.13.10's exemption
applies there because **"Call site" in the action bar is the labelled equivalent on the same screen** —
which is exactly the condition Leads failed. The distinction is the rule, not an inconsistency.

**Also fixed:** a recurring startup failure. Turbopack's persistence DB under `.next/dev` is repeatedly
left unreadable on this exFAT volume (`invalid digit found in string`), blocking `next dev` — it had cost
three manual cache clears. A `predev` script now clears it, removing a self-inflicted outage rather than
re-diagnosing it each time.

**Console:** clean in Chrome across `/`, `/today`, `/leads`, `/jobs/[jobNumber]` — no errors or warnings.

---

# Phase 3b — Create invoice from job (§6.11)

## GATE 3 — Content, and why the logic came first

**The one decision:** *is this bill correct enough to send?* — **not** "enter an invoice". Everything is
pre-filled from the job; §6.11 calls it "a review surface with editable fields, whose job is to make one
specific error — **wrong tax head, wrong code** — impossible to make silently".

So `src/lib/tax.ts` was written and tested **before** any pixels: the derivation, the FR-812 rounding and
the FR-803 digit precision are pure functions, because they are the part of this product that has to be
*provably* right rather than plausibly right.

## GATE 4 — Originate

**The derivation returns its reasoning, not just its result.** §6.11.2:

> "The single most valuable element in the billing module. Charging CGST+SGST where IGST was due is the
> commonest and most expensive GST error a small service firm makes, invisible until a notice arrives,
> and **no incumbent tool explains its reasoning**."

`derivePlaceOfSupply` returns an `explanation` sentence which the screen renders **verbatim**, so the
displayed reasoning and the computed head cannot drift apart. Live on the seed data it reads:

> *Site in Maharashtra (27) · your GSTIN in Delhi (07) → IGST*

— which is the function deriving, not a hardcoded string: the seed tenant's GSTIN is Delhi, the site is
Maharashtra, so the cross-state branch is correct and IGST is charged.

**Override requires a typed reason that is stored on the invoice** (§6.11.2). Genuine exceptions occur;
silent ones must not.

**`SAC/HSN` is one column with one label.** §6.11.2: a single "HSN" header — "what most tools ship" —
"trains users to put HSN codes on services, which is wrong."

**Compliance is a checklist, not an error list.** "Green ticks tell the accountant the machine did the
boring work. This is what buys his trust."

**One combined primary — `[Finalise & send on WhatsApp]`.** §6.11.5: "the accountant's actual intent is
always 'bill and send'; splitting it produces finalised invoices that were never sent — a real and
expensive failure mode."

## Tests — `src/lib/tax.test.ts`, 14 assertions

FR-812 asks for "a property-based test over **100,000 randomly generated invoices**", and that is what it
gets — seeded (xorshift32) rather than `Math.random`, so a failure is reproducible instead of a flake.
Across 100,000 generated invoices it asserts:

- `taxable + tax + roundOff === grandTotal` — FR-812's footing identity, stated exactly as the PRD does
- the grand total is always a whole number of rupees
- `|roundOff| ≤ ₹0.50`
- `cgst + sgst === totalTax` — the split never creates or destroys a paisa

It also reproduces §6.11.1's worked invoice exactly: taxable 4,840.00 · round off (0.20) · **₹5,711.00**.

## GATE 6 — Audit

### Defect found by rendering, not by tests

🔴 **The invoice emitted 6-digit HSN/SAC codes while the compliance panel said "AATO below the ₹5 crore
threshold".** Two surfaces asserting opposite things about the same fact — precisely what that panel
exists to prevent.

Cause: the seed tenant's AATO was written `42_00_00_000_00` — **₹42 crore, ten times the intent** — which
put it above the threshold. Every unit test passed, because the functions were correct and the *fixture*
was wrong. Corrected to `4_20_00_000_00` (₹4.20 crore); codes now render `9987` / `8532`.

Worth stating: a fixture error of this shape is indistinguishable from a logic error on screen, and only
a rendered invoice surfaced it.

| # | Dimension | Score |
|---|---|---|
| 1 | Font | 8 — 28px TOTAL, tabular figures throughout, `tnum-id` on codes and GSTIN where 0/O confusion has a cost |
| 2 | Color | 8 — the derivation line carries the only brand tint on the document; one primary |
| 3 | Background | 8 — 62/38 split; document on one surface, evidence and compliance on their own |
| 4 | Visibility | 8 — round-off explicit, nothing truncated |
| 5 | Impact | 9 — the derivation line is the first thing read after the parties, which is the order the error occurs in |
| 6 | User empathy | 9 — bills from evidence (signature, signer, rating) so the accountant never opens the job; ticks rather than errors |
| 7 | Wow | 9 — a tax engine that explains itself in a sentence, backed by 100,000 generated invoices that foot exactly |

**Average 8.43 · every dimension ≥ 7 · PASS.**

### Deferred

- Line editing, `PENDING_IRN`, and the tax-master-unavailable state (which must **disable Finalise with
  a visible reason** — "guessing a rate is not an option") need a backend to be real.
- 🚫 Status ceiling 🟡 `UI-complete · backend suspended`.

---

## Phase 3 — Contracts, Money, Jobs list, work order + end-to-end flow test

Built to close the flow Raunak asked to walk end to end: *talk to lead → create order → assign job →
create invoice (monthly/quarterly/yearly) → create work order.*

New screens: `/contracts`, `/contracts/new`, `/money` (both sides), `/jobs`, `/jobs/new`, and the
lead→conversion action. New modules: `contracts.ts`, `money.ts`, `persisted-choice.ts`, plus
`recommendTechnician`/`scheduleProgress`. Tests 124 → **154**.

### The decision the contract form exists to protect

FR-505: *"A monthly visit schedule with annual upfront billing is the most common combination in this
market and **must not be forced into per-visit billing**."* So visit schedule and billing frequency are
two independent controls, and the screen states the consequence of the pair in words. Verified live:

| Visits | Billing | Panel reads |
|---|---|---|
| Monthly | Yearly, upfront | 12 visits a year · 1 invoice of ₹3,60,000.00 |
| Monthly | Quarterly | 12 visits a year · 4 invoices of ₹90,000.00 |
| Monthly | Monthly | 12 visits a year · 12 invoices of ₹30,000.00 |
| **Alternate monthly** | Monthly | **6** visits a year · 12 invoices of ₹30,000.00 |

The last row is the point: the axes do not contaminate each other, and `ALTERNATE_MONTHLY` yields six,
not twelve (FR-501's acceptance criterion). FR-810's advance warning appears on upfront schedules only.

### Defects found by rendering, and what each one taught

🔴 **The whole document scrolled sideways at 1280px.** `SidebarInset` is a flex child; a flex item
defaults to `min-width: auto`, so `<main>` refused to shrink below its widest row and pushed the document
to 1325px in a 1280px viewport — clipping the sidebar and rendering the page title as "eads". Fixed in
the primitive (`min-w-0`), not per-screen. **Then swept all 12 routes × {390, 768, 1280, 1600} = 48
combinations; 48/48 now zero overflow.** Measured, not eyeballed.

🔴 **"Behind schedule" on a contract that started yesterday.** The bar flagged 3-of-12 visits as
under-delivery on day 2 of a 365-day term. Delivery has to be measured against *elapsed time*, not
against the annual total — otherwise every healthy new contract shows the warning, the owner learns to
ignore it, and the one contract genuinely being under-delivered is indistinguishable from the eleven
that are fine. `scheduleProgress()` now reports **how many visits behind** ("6 visits behind — 10 were
due by now"), because "behind schedule" is a mood and "6 visits behind" is something you can staff for.

🔴 **§6.14 asks for a *segmented* visit bar; I had shipped a 4px continuous track.** At full Chrome
resolution it read as an underline on the label above it. Replaced with one cell per committed visit in
three states — delivered / due-and-missed / still to come — so the shortfall is countable. Same treatment
as the §43B(h) countdown, which is the right family resemblance.

🔴 **Five filled primaries in the assignment panel.** Identical to the defect already fixed on the job
rows, reintroduced one layer down. `recommendTechnician()` now picks exactly one, using the criteria the
panel already displays: not on leave → has the skill → already working that locality (§6.4.2: clustering
is "most of a dispatcher's craft") → lighter load. It returns `null` on a dead tie or when nobody has the
skill, so **no** button is filled and the absence tells the coordinator this needs a human. The row's own
`[Assign]` drops to outline once assignment mode starts.

🔴 **A form that pre-filled ₹3,60,000 nobody typed.** Same class of lie as rendering ₹0 for a value we
could not compute: it looks like data, survives a distracted glance, and becomes a contract billed at the
wrong amount. Now empty, with em-dashes in the panel and Create disabled until customer, site and value
all exist.

🔴 **An ageing band rendering `₹0.00`.** A rupee figure in a row of rupee figures reads as money owed;
the eye does not stop to notice it is zero. Empty bands now render `—` on a dashed border and are not
offered as filters, since selecting one can only produce an empty list.

🟡 `Visit —/—`, `Overdue —`, and the greeting all verified correct in Chrome at 11pm.

### Two things modelled rather than documented

- **`Countdown` is a discriminated union** — `counting | not_applicable | unknown`. An unverified vendor
  cannot render a confident number, and "we cannot calculate this" is a different *shape* from "day 38 of
  45". `deductionAtRiskPaise` counts only `counting` bills, so an unquantified risk is never silently
  folded into a quantified total; unverified vendors get their own above-the-fold group instead.
- **Won and Lost do not take a follow-up date.** FR-104 blocks a save without one because "a lead without
  a date gets forgotten" — but that reasoning only holds for a lead still in play. `isTerminalOutcome`
  encodes the distinction, and Won is where FR-106's conversion is offered, since it is the only moment
  the coordinator knows the deal is real.

### Also

- `useSearchParams` replaced by server-page `searchParams` props on both new-record routes — the Next
  docs' own recommendation, and it removes the prerender hazard entirely. Build: 13 routes, clean.
- `usePersistedChoice` uses `useSyncExternalStore`, not an effect that calls `setState`. A remembered
  preference *is* an external store; the effect version renders the wrong tab once and corrects itself,
  which is a visible flicker on every load.
- The job row is **two layouts**, not one squeezed one: §6.4.7's 96px three-line card below `sm`, the
  44px row above. `[+ Create job]` becomes a pinned labelled pill at 390px, never a bare `+`.
