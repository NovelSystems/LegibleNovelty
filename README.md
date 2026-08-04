# Legible Novelty — Library & Workshop

An open, donation-funded platform for **community-authored educational modules** that embed
standard learning objectives inside a learner's special interest. It is built for autistic
learners in particular — for whom a special interest is often the most reliable route into
new material — but the approach is general: teach multiplication through trains, grammar
through a favourite game, chemistry through cooking, without diluting the underlying academic
objective.

The platform is named after the **Legible Novelty** framework (documented in the book of the
same name), which treats a good learning artifact as one that is *contextually immersive*,
*recoverable*, *signaled*, and *bounded* — novel and engaging on the surface, but legibly
anchored to a concrete objective underneath.

> **Status:** early build. The design is fully resolved at the specification level. The code
> covers **Stage 0 and 1, all three Workshop sub-stages (Seed Editor, Module Editor, Lesson
> Planner), the cross-cutting Standing Scores system, and the first two Library sub-stages
> (Endorsement & Community Recommendation; Search, Ranking & Discovery)** — all on a single unmerged
> branch. Endorsement & Recommendation closed more forward-built stubs than any prior sub-stage — it
> is what finally sets `Account.first_seed_endorsement_received`, wires the previously-dormant
> endorsement/recommendation Standing Score triggers, and resolves the module "public section"
> visibility question. Search/Ranking/Discovery then builds the sort/filter/homepage/quick-search
> layer that reads that trust data. See
> [Build status](#build-status) for exactly what exists, what's deferred, and what's still
> unsettled.

---

## How it works

The platform's public-facing brand is split in two, and the codebase follows the same line:

- **The Library** is the unconditionally public reading experience — anyone can read any
  published module and its "Big Questions" archive with **no account required**. This is a
  non-negotiable design principle: a learner who needs these materials should never be blocked
  by account friction, a parent's inaction, or institutional access.
- **The Workshop** is the account-gated, contributor-facing side — authoring, the commission
  marketplace, and the contributor roles.

Content is produced from two linked artifacts:

| Artifact | Authored by | What it is |
|---|---|---|
| **Learning Seed** | Seed Architect | A reusable, domain-agnostic pedagogical unit: a learning objective stated as a goal criterion, its prerequisites, and the constraints a valid lesson must satisfy — carrying no domain flavour of its own. |
| **Contextualized Module** | Module Author | A Seed connected to a specific special-interest domain, drawing its examples and numbers from that interest while still satisfying the Seed's constraints. |

**Verified Educators** endorse seeds and modules as a positive trust signal — endorsement is
additive and never a gate; nothing needs endorsement to be published or read. Quality surfaces
through educator endorsement, community recommendation, and usage, not through mandatory
pre-publication review.

For the complete design — roles, account lifecycle, moderation, commissions, notifications,
payments, and the eight-subsystem map — see the internal design document
(`LN_Webapp_Design`). This README covers the repository and how to run it; the design document
is the authoritative source for product behaviour.

---

## Build status

The project is built in stages. What follows is a genuine snapshot, not a changelog: it says
what exists, what doesn't, and what is still unsettled. Read the deferred and open-items sections
below as carefully as this one — several "complete" pieces are wired against stubbed references
and won't do anything real until a deferred subsystem lands.

Each completed piece gets one line here; the linked brief in [`docs/briefs/`](./docs/briefs) is
the authoritative detail for it, and [`docs/LN_Webapp_Design_v0.13.md`](./docs/LN_Webapp_Design_v0.13.md)
is the authoritative source for overall product behaviour.

### What exists today

Everything below is **complete and tested against a fresh database** (see [Running the
checks](#running-the-checks)). All of it lives on a single unmerged branch — see
[Branch and PR state](#branch-and-pr-state).

- ✅ **Stage 0 — Infrastructure substrate.** The local, zero-cost Docker environment (PostgreSQL,
  the Node app container, a Mailpit email catcher, Auth.js on revocable **database sessions**, and
  `scripts/check.sh` standing in for CI) that everything else runs on.
- ✅ **Stage 1 — User Management.** The real `Account` identity substrate: authentication, the
  account lifecycle (child sub-accounts, graduation, deactivation/purge/reclaim, display-name
  reuse blocking), Connection/ParentApproval, Share Contact, Verified Educator verification with
  peer-token accountability, status badges, an Awards backend schema, and seven email triggers.
  → [`docs/briefs/Stage1_User_Management.md`](./docs/briefs/Stage1_User_Management.md)
- ✅ **Workshop — Seed Editor** _(first of three Workshop sub-stages)_. Learning Seed schema with
  no authoring gate, the two-level Subject→Topic Taxonomy, Seed Chains (with backend
  coverage/gap/density/language-coverage queries), the invite-only draft-comment workflow, the two
  asymmetric placement paths, and the anti-spam publish quota.
  → [`docs/briefs/Workshop_SeedEditor.md`](./docs/briefs/Workshop_SeedEditor.md)
- ✅ **Workshop — Module Editor** _(second of three)_. Contextualized Module schema (primary and
  secondary seeds each pinned to an exact `SeedRevision`), the lifecycle/version state machine, the
  two deterministic publication-gate checks, report-driven takedown wired into Standing Scores, the
  content-governance review/appeal layer, the under-18 endorsement visibility gate, and the
  page/element/template authoring model.
  → [`docs/briefs/Workshop_ModuleEditor.md`](./docs/briefs/Workshop_ModuleEditor.md)
- ✅ **Workshop — Lesson Planner** _(third of three)_. The `LessonPlan` "playlist" of **live**
  (unpinned) module references, the creator/assigner distinction, per-instance
  `LessonPlanAssignment` records, `LessonPlanReport`, the per-learner/per-module tracking dashboard
  against a stubbed completion signal, and the completion-submission prompt. Deliberately un-gated
  (no VE and no DSS check on creation or assignment); closes Stage 1's `ParentApproval.lesson_plan_id`
  soft reference with a real FK.
  → [`docs/briefs/Workshop_LessonPlanner.md`](./docs/briefs/Workshop_LessonPlanner.md)
- ✅ **Standing Scores (ESS / DSS / CSS) — cross-cutting governance, _not_ a fourth Workshop
  sub-stage.** One shared `StandingScore` table (type discriminator, decimal value, lazy read-time
  weekly drift, a 0-lock latch, restoration) plus an append-only `StandingScoreEvent` record. It
  spans subsystems: DSS gates Seed/Module authoring, CSS drives report outcomes, ESS governs VE
  standing. Its report/takedown triggers were wired at Module Editor; its **endorsement- and
  recommendation-driven** triggers stayed unwired until the Library sub-stage below activated them.
  → [`docs/briefs/StandingScores.md`](./docs/briefs/StandingScores.md)
- ✅ **Library — Endorsement & Community Recommendation** _(first Library sub-stage)_. The per-seed
  VE-or-LNC `Endorsement` and per-module eligibility-gated `CommunityRecommendation` models (both
  additive-only binary toggles, hard-delete on toggle-off), the single shared 7-day/completed-profile
  eligibility gate (`lib/eligibility.ts`, reused by comments and commission-support later), and the
  wiring of every stub left waiting on it: `Account.first_seed_endorsement_received` (and thus the
  Seed Editor publish-quota transition), the endorsing-VE placement flag routing through the existing
  `SeedDraftComment`, the white/grey cross-version count split, the "edited under you" warning, the
  first-endorsement "public section" promotion, and the DSS `+5/+1/+0.1` and ESS `+5/-5` Standing
  Score triggers (reusing the existing helpers).
  → [`docs/briefs/Library_EndorsementRecommendation.md`](./docs/briefs/Library_EndorsementRecommendation.md)
- ✅ **Library — Search, Ranking & Discovery** _(second Library sub-stage)_. The five sort modes and
  their formulas with the AI-attestation multiplier (`lib/search.ts`, reading the existing
  `ai_attestation`), the full filter set (context tag, free-text-substring grade, subject/topic,
  language, binary endorsement status, attestation tier — combining Context OR-within / AND-across),
  the cascading-window homepage list (`lib/homepage.ts`: 2 weeks → 2 months → anytime, ranked by
  Weighted Approval, up to 20, static empty state), and the Quick Search backend helpers (cascading
  Subject→Topic, alphabetical Context options, "use my interests"). Adds `context_tag`,
  `download_count`, and `passing_completion_count` to `ContextualizedModule`. Usage sorts are wired
  and tested against stubbed download/completion counts (nothing populates them until PDF Generation
  and Quiz/Scoring land).
  → [`docs/briefs/Library_SearchRankingDiscovery.md`](./docs/briefs/Library_SearchRankingDiscovery.md)

### Branch and PR state

**All of the above lives on one feature branch (`claude/legible-novelty-stage-1-6u9tfw`) and has
not been merged.** There is no PR open and nothing has landed on the default branch yet. "Complete"
here means built, migrated, and passing `scripts/check.sh` on that branch — not released. Treat the
branch as the source of truth for current state; do not assume any of this is on `main`.

### What's explicitly deferred, and why it matters here

Pulled from each brief's "Explicitly deferred" section. These aren't just unbuilt neighbours — each
one has already-built code pointing at it through a stub or soft reference, so it's load-bearing for
things that look done:

- **Library — Reading mechanics: Printable/Downloadable Format, Quiz/Test/Scoring, Progress Archive**
  (Sections 7.3–7.5). Separate Library sub-stage. This is also the source of the two Usage-sort inputs
  Search/Ranking already wired but cannot populate: `download_count` depends on PDF Generation
  (Section 15) and `passing_completion_count` on Quiz/Scoring (Section 7.4). Both columns exist and
  the Usage formulas read them; nothing increments them yet. The Lesson Planner tracking dashboard and
  completion-submission prompt likewise run against a **stubbed completion signal** until this lands.
- **Library — Named filter presets** (Section 9.5's own "deferred to the UI build phase," Section 18).
  The one-click "Endorsed + Weighted Approval" style presets sit on top of the filter/sort primitives
  Search/Ranking just built.
- **PDF Generation (Section 15).** Feeds `download_count` and the printable artifact; Section 22 never
  assigns it to a subsystem (still flagged). The endorsement-status binary it stamps on covers exists.
- **Communication — `Post`/`Comment` (`thread_type`) model.** Stage 1's `TokenRequestThread` is a
  deliberate stopgap to be folded into this; CSS's comment-report outcome triggers wait on it.
- **Communication — Big Questions interactive mechanic.** The read-only archive is Library's; the
  submission/participation mechanic is Communication's. Neither is touched.
- **Commission Marketplace.** Fell out of the Workshop three-way split and **still needs its own
  scoping**. Module Editor's commission-alignment publication check is a deliberate structural
  no-op, and `associated_commission_id` on seeds and modules is an unenforced soft reference, both
  until real structured commission fields exist.
- **Certification Center (LNC mini-LMS).** `Account.lnc_status` and `veframework_onboarding_passed`
  exist as columns but nothing sets them; LNC's "retake the free certification test" ESS-restoration
  path waits on it.
- **Payments & Billing.** `Account.fotl_status` is a placeholder column; this is also Certification
  Center's own dependency.
- **DEF Arbitration (Phase 2).** Module Editor reserves a nullable `prepublication_review_report`
  column for the eventual report; the AI pre-publication review itself is compute-dependent Phase 2.
- **AI authoring wizard.** Deferred pending an established contributor base and an unresolved pricing
  model; Module Editor's `AiAttestation` lock rule exists in anticipation of it.
- **Escalation panel staffing.** Module Editor builds the appeal **schema** (`ModuleReviewAppeal`,
  3+ distinct reviewers); the panel's actual staffing/recruitment is marked "pending Phase 1
  staffing decision" in the governance policy and is not built.

### Open items still genuinely unresolved

These come straight from the briefs' "Open items carried forward" sections. They fall into **two
different categories** — don't flatten them together:

**(a) Proposed-but-unconfirmed design choices** — built one specific way, but flagged as not
confirmed; changing them is a decision, not a bug:

- **Creator-side CSS tiers for lesson-plan report resolution** (`insufficiency 0 / inappropriate -5
  / egregious -20`) — proposed, mirroring DSS's severity shape scaled to CSS. New scope the Standing
  Scores brief predates.
- **Seed-report Standing Score values** — CSS `+5/-2` to the reporter and the DSS severity tier to
  the architect are a proposed synthesis connecting two previously separate threads, not confirmed.
- **Escalation-tier routing via Taxonomy** — inferred to reuse Seed Editor's
  `Taxonomy.is_political_systems` placement rather than a standalone module-level tag; not explicitly
  confirmed.
- **Secondary-seed revision-pinning** — each secondary seed is pinned to a `SeedRevision` like the
  primary; this is an inferred requirement, not stated in the source.
- **Publish quota applies uniformly regardless of role** — no VE/Admin exemption from the
  pre-endorsement cap; not stated either way, worth confirming.
- **The "different VE than the original granter" ESS-restoration constraint is no longer enforced
  anywhere** after the restore-then-grant reordering (the dead `canRestoreEss` helper was deleted);
  re-adding it is a separate design decision.
- **Publish-immediately posture** (Module Editor Task 3) is explicitly tied to the pilot's small,
  known user base and should be revisited before any wider launch.
- **Template creation is built admin-only** (the narrower default); whether module authors can
  create their own reusable templates is unconfirmed.
- **ESS -5 targets only the PRIMARY seed's first endorser** on rejection of an endorsed module — an
  inference (the source doesn't disambiguate). If a module has multiple endorsed seeds by different
  VEs, this penalizes only the primary seed's first endorser, consistent with the primary seed being
  "what educator endorsement actually vouches for." Flag if endorsement of *any* seed should instead
  trigger this penalty for that seed's specific endorser.
- **"Completed profile" for the eligibility gate is defined as** verified email + at least one
  interest domain + at least one language preference — an inference (Section 9.5 requires "a completed
  profile" but never enumerates fields). It lives in one place (`lib/eligibility.ts:isProfileComplete`);
  adjust there and every call site follows.
- **Endorsement eligibility is VE-or-LNC (resolved).** Section 9.1's prose said "only Verified
  Educators," but Section 22's summary of the same section says "VE/LNC status specifically"; Section
  22's broader reading is correct (Section 4.3 gives LNC-holders the same endorsement ability), so the
  live check is `ve_status || lnc_status`. `lnc_status` has no source until Certification Center ships,
  so the LNC path is currently unreachable but implemented and tested.
- **Grade-level filter is a free-text SUBSTRING match, not a numeric range.** Seed Editor deliberately
  made `grade_range` free-text/non-sortable; the Search sub-stage now needs to filter on it, so it
  does a case-insensitive `contains` match. Worth revisiting whether that original non-sortable
  decision should change now that filtering against the same field is a stated requirement.
- **AI-attestation multiplier for AI Pipeline / null attestation is 1×.** The doc gives 10×/2× for the
  two live tiers and "1×" for the deferred AI Pipeline tier; a NULL attestation is undefined. Both are
  treated as the neutral 1× (no boost). Adjust in `lib/search.ts:ATTESTATION_MULTIPLIER` if a different
  call is made.
- **GAP — module submission does not enforce the AI-attestation declaration.** Section 9.4 says "a
  Module Author must declare the generation profile ... before the system accepts it", but
  `ContextualizedModule.ai_attestation` is nullable and neither `submitForReview` nor `publishModule`
  (Module Editor) requires it to be set — so a published module can genuinely reach ranking with no
  attestation. This is a Module Editor enforcement gap, surfaced (not papered over) by the ranking
  multiplier's null handling above; ranking treats the missing declaration as the neutral 1× floor so
  an undeclared module can't gain the multiplier, but that is a safe default, not a fix for the missing
  enforcement. Closing it (require attestation at submit/publish, and decide whether existing null rows
  need backfill) is a Module Editor change, left for confirmation rather than made here unprompted.
- **`context_tag` / `download_count` / `passing_completion_count` are retroactive `ContextualizedModule`
  additions** the Search sub-stage makes, not in Module Editor's original field list — same category as
  Seed Editor's `language`/`published_at` additions. `download_count` and `passing_completion_count`
  are populated by nothing yet (PDF Generation and Quiz/Scoring are unbuilt).

**(b) Genuinely open questions with no current answer** — the schema tolerates them being unresolved,
but nobody has decided:

- **`algorithmic_constraints` JSON shape for non-Math seeds** — only ever illustrated for Math
  (numeric ranges); no equivalent structure exists for Literacy or Science. The single biggest open
  modeling question; expected to resolve through actual use of the seed editor, not up-front design.
- **Taxonomy topic-proposal workflow** — how a VE's proposed Topic actually routes to System_Admin
  approval is undecided; the table exists without it.
- **`veframework_onboarding_passed`'s gating mechanism** (quiz vs. completion, and its sequencing
  relative to VE verification) — the column is a placeholder; the mechanism is undecided.
- **`AwardCategory.eligibility_threshold`** type and value — genuinely unset pending platform
  activity data; left nullable rather than guessing a placeholder that could later read as real.
- **Maximum page count per module** — none is built because none was specified.
- **Whether VE endorsement should be scoped/revocable per module version** vs. platform-wide is
  marked "pending design decision" in the governance policy itself.
- **Whether a secondary seed's endorsement should promote visibility** independently of the primary
  seed — the Library sub-stage wires ONLY the primary-seed "public section" promotion (consistent with
  the primary seed being the credential-bearing one); whether secondary-seed endorsement should do
  anything visibility-wise is untouched.
- **The "edited under you" delta is measured in ELEMENTS, not lines.** Module content is page/element
  JSON with no "lines", so the warning quantifies change as the net `ModuleElement`-count delta since
  the current version's publish (a new `ContextualizedModule.published_element_count` baseline set at
  publish) — the structural analog of a line delta. Two honest limits, both from Module Editor
  persisting no per-edit changelog: it is a NET count (pure in-place text edits, or equal add/remove
  churn, read as 0), and the baseline is publish-time (change *on this version since it went live*,
  surfaced alongside the within-the-hour recency trigger, not a strict trailing-60-minute window). A
  character-level or true trailing-window delta would need an edit-diff baseline Module Editor does not
  keep.
- **Section 15 (PDF cover / print generation) is unassigned in the Section 22 subsystem map** — the
  same category of gap as the earlier Taxonomy/Section-6 omission. It depends on the endorsement-status
  binary this sub-stage produces but is its own downstream artifact concern; not resolved here.
- **Homepage domain-diversity capping** (Section 9.6) — whether to cap consecutive modules from the
  same Subject/Context on the highest-visibility page. The design doc leaves it explicitly undecided;
  the Search sub-stage does not default it either way (the list ranks purely by Weighted Approval).
- **Context listbox collapse behaviour** (Section 9.7) — the listbox is specified NOT to auto-collapse
  on blur; what closes it (an explicit control, or staying open for the panel's lifetime) is undecided.
  A frontend/UI concern, unresolved.
- **"Use my interests" loading indicator** (Section 9.7) — whether a spinner shows between click and
  result, or the fetch is assumed fast enough. Undecided; the backend helper (`useMyInterests`) is
  agnostic to it.
- **Usage sorts are unexercisable with real data** until PDF Generation (`download_count`) and
  Quiz/Scoring (`passing_completion_count`) land. The formulas are built and tested against stubbed
  counts; nothing populates the columns yet.

### Cross-cutting patterns worth knowing before touching this code

Brief callouts; the real detail lives in the referenced files.

- **The latch (Standing Scores).** `StandingScore.locked_at` is what gates functionality — the
  numeric `current_value` moves independently under drift and can even climb while locked; only
  restoration clears `locked_at`. Never infer lock state from the value. See `lib/standing-scores.ts`.
- **One shared report-quota cap.** A single function, `combinedReportsTodayCount`
  (`lib/report-quota.ts`), enforces the 3/day midnight-Pacific cap across seeds, modules, and lesson
  plans in one place (comment reports slot into the same function when Communication ships) — don't
  add a per-type cap.
- **`event_type` is a free-text string, not an enum.** Every `StandingScoreEvent.event_type` value
  (`module_dss_egregious`, `lesson_plan_removed_unclassified`, …) is an unconstrained `String`. This
  is a **known, flagged risk, not yet fixed**: a typo fails silently and only the tests guard it.
  Promoting these to an enum is a deliberate cross-cutting migration, out of scope so far.
- **Module pins; LessonPlan deliberately does NOT — they look alike and are opposite by design.** A
  `ContextualizedModule` pins to an exact `SeedRevision` (`primary_seed_revision_id`,
  `ModuleSecondarySeed.seed_revision_id`) and never retroactively changes. A `LessonPlan` stores the
  **live** `module_id` (`LessonPlanModule.module_id`) so it always reflects the module's current
  published version. **Do not copy the pinning pattern from Module into Lesson Planner out of habit** —
  the difference is intentional (curation tracks the current artifact; a citation freezes it).

**Two boundaries worth knowing up front:**

- **All AI functionality is Phase 2.** Phase 1 ships every feature that *could* use AI as a
  fully manual process with the same user-facing outcome — no automated review, screening, or
  content generation anywhere on the platform. The AI layer (DEF-arbitration pre-publication
  review, the authoring wizard, educator-verification screening, Big Questions merge
  suggestions) is added on top later and narrows human workload rather than changing what a
  feature does.
- **Production hosting is deliberately deferred.** The eventual target (Hetzner VPS + Nginx +
  PM2, managed PostgreSQL, Let's Encrypt) is decided but intentionally not built yet — it is
  revisited as one block when the financial picture is clearer. Stage 0 is local-only by
  design; connection details are environment-driven so that swap is a config change, not a
  re-architecture.

---

## Tech stack

| Concern | Stage 0 (local, now) | Production target (deferred) |
|---|---|---|
| Runtime | Node.js 24 (Active LTS), pnpm 9 via Corepack | same |
| Framework | Next.js 15 (App Router), React 19 | same |
| Auth | Auth.js — **database sessions**, `@auth/prisma-adapter` | same, session store stays PostgreSQL (Redis path left open) |
| ORM / DB | Prisma → PostgreSQL 17 (Docker), UTF-8 | Prisma → managed PostgreSQL, UTF-8 |
| Email | **Mailpit** local catcher (SMTP + REST API) | Resend, via the Auth.js email adapter — a config swap, not new code |
| Editor | — _(TipTap, when authoring is built)_ | TipTap |
| Payments | — _(Stripe, when billing is built)_ | Stripe |
| Hosting | Docker Compose on your machine | Hetzner VPS, Nginx, PM2, Let's Encrypt |
| CI | `scripts/check.sh`, run manually | (GitHub Actions deliberately deferred) |

Database sessions (not JWT) are a hard requirement, not a default: they are revocable, which
Stage 1's account-deletion and parent/child access-revocation flows depend on.

---

## Local development

Everything runs in Docker, so results reflect how the app actually runs rather than whatever
state your host machine happens to be in.

### Prerequisites

- **Docker** and **Docker Compose** (v2). That's the only hard requirement.
- Optional, for running tooling outside the container: **Node 24** (see `.nvmrc`) with
  **Corepack** enabled (`corepack enable`) — the pinned pnpm version comes from
  `package.json`'s `packageManager` field.

### Setup

```bash
# 1. Configure environment (never commit .env — it is gitignored)
cp .env.example .env

# 2. Set a session secret in .env
#    AUTH_SECRET=$(openssl rand -base64 33)

# 3. Bring the whole environment up
docker compose up
```

That starts three services:

| Service | Address | Notes |
|---|---|---|
| **app** | http://localhost:3000 | Next.js dev server |
| **mailpit** | http://localhost:8025 | Web UI for inspecting caught email; SMTP is internal on 1025 |
| **postgres** | _(internal only)_ | Not exposed to the host by default; add a `ports:` mapping if you want direct access |

Three logical databases are provisioned automatically on first start: the main database, a
**shadow** database (for `prisma migrate dev`), and a dedicated **test** database.

### Running the checks

`scripts/check.sh` is the manual stand-in for CI — run it before merging. From a clean slate
it rebuilds the Docker images, brings Postgres and Mailpit up healthy, installs dependencies,
lints, type-checks, applies migrations and runs the test suite against the test database, and
produces a production build — printing a full pass/fail/skipped summary at the end (it does not
stop at the first failure).

```bash
./scripts/check.sh
```

> ⚠️ **Do not run `check.sh` while a separate `docker compose up` dev session is active.**
> The script tears down all containers and volumes (`docker compose down -v`) at its start and
> end, which will destroy that session's data — including your dev database.

### A note on dependencies

`node_modules` lives in a **named Docker volume** layered over the project bind mount, so the
host directory never shadows the dependencies (and generated Prisma Client) the image built.
The tradeoff: after changing dependencies in `package.json`, a plain restart won't pick them
up — rebuild with `docker compose down -v` and bring the environment back up.

---

## Project layout

```
.
├── app/                     # Next.js App Router (routes, actions, components)
│   └── api/auth/[...nextauth]/route.ts
├── auth.ts                  # Auth.js config: Account-backed adapter + database sessions
├── lib/                     # Service layer — one module per feature area (see below)
├── prisma/
│   ├── schema.prisma        # Full schema: User Management + Seed/Module/Lesson + Standing Scores + Library
│   └── migrations/          # Committed migration history (11 migrations, additive)
├── db/init/                 # Postgres init (shadow + test databases, UTF-8)
├── tests/                   # Vitest: auth, lifecycle, seeds, modules, lesson plans, governance, …
├── docs/                    # Authoritative specs: LN_Webapp_Design + per-stage briefs/
├── scripts/check.sh         # Manual CI substitute
├── docker-compose.yml       # postgres + app + mailpit
├── Dockerfile               # node:24-alpine + Corepack
└── .env.example             # Documents required environment variables
```

The `lib/` service layer has grown past Stage 1 to cover the merged sub-stages: `accounts`,
`lifecycle`, `connections`, `contact`, `verification`, `flags`, `badges`, `grade` (User
Management); `seeds`, `curriculum`, `quota` (Seed Editor); `modules`, `module-authoring`,
`module-reports`, `module-visibility` (Module Editor); `lesson-plans`, `lesson-plan-dashboard`,
`lesson-plan-reports` (Lesson Planner); `endorsement` and `eligibility` (Library — Endorsement &
Community Recommendation); `search` and `homepage` (Library — Search, Ranking & Discovery); and the
cross-cutting `standing-scores`, `report-quota`, `seed-reports`, and `pacific-time`. The single
`prisma/schema.prisma` now holds every table for all of these; the
schema names are the source of truth. Subsystems that are still deferred (the rest of Library,
Communication, Commission Marketplace, Certification Center, Payments) bring their own tables when
they land.

---

## Environment variables

`.env` is gitignored and must never be committed. `.env.example` documents everything; the two
required by `check.sh` are:

- `DATABASE_URL` — main application database.
- `TEST_DATABASE_URL` — dedicated test database (migrations and tests run here).

Also used: `SHADOW_DATABASE_URL` (for `prisma migrate dev`), `AUTH_SECRET` / `AUTH_TRUST_HOST`
(Auth.js), and the Postgres and Mailpit connection settings.

---

## Contributing

Work happens on feature branches and is validated with `./scripts/check.sh` before merge — no
external accounts or services are needed to run the full check locally. The repository is
currently private.

## License

**GNU Affero General Public License v3.0 (AGPL-3.0).** See [LICENSE](./LICENSE).

AGPL is a deliberate choice: it closes the "SaaS loophole" so that anyone running a modified
version of this platform as a hosted service must also open-source their modifications —
protecting a donation-funded public good from being forked into a closed competitor.
