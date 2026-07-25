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
> Planner), and the cross-cutting Standing Scores system** — all on a single unmerged branch,
> much of it wired against stubbed references that stay inert until deferred subsystems land. See
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
  standing. Many of its triggers are built but **unwired**, waiting on deferred subsystems (see
  below). → [`docs/briefs/StandingScores.md`](./docs/briefs/StandingScores.md)

### Branch and PR state

**All of the above lives on one feature branch (`claude/legible-novelty-stage-1-6u9tfw`) and has
not been merged.** There is no PR open and nothing has landed on the default branch yet. "Complete"
here means built, migrated, and passing `scripts/check.sh` on that branch — not released. Treat the
branch as the source of truth for current state; do not assume any of this is on `main`.

### What's explicitly deferred, and why it matters here

Pulled from each brief's "Explicitly deferred" section. These aren't just unbuilt neighbours — each
one has already-built code pointing at it through a stub or soft reference, so it's load-bearing for
things that look done:

- **Library — Endorsement.** Module Editor's under-18 endorsement visibility gate, the "Seed
  Architect" earned title, and DSS/ESS's endorsement-driven payouts are all built against
  `Account.first_seed_endorsement_received` (a real column **nothing currently sets** — Endorsement
  will).
- **Library — Community Recommendation.** DSS's `+0.1`-per-recommendation trigger and ESS's
  "+5, first endorser at 10 recommendations" trigger have schema support but no source of
  recommendation events until this exists.
- **Library — Progress Archive + Quiz/Test/Scoring.** The Lesson Planner tracking dashboard and the
  completion-submission prompt run entirely against a **stubbed completion signal**; the real
  per-learner completion and score data comes from here (Sections 7.4–7.5).
- **Library — browse / search / reading, ranking, sort, filters.** The public reading experience
  itself; Module Editor exposes the FK targets it needs and builds none of the consuming logic.
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
- **Whether unendorsed content is search-reachable only, or also passively surfaced** (browse,
  recommendations, homepage) to adult accounts — Library's call, not assumed here.
- **Whether VE endorsement should be scoped/revocable per module version** vs. platform-wide is
  marked "pending design decision" in the governance policy itself.

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
│   ├── schema.prisma        # Full schema: User Management + Seed/Module/Lesson + Standing Scores
│   └── migrations/          # Committed migration history (8 migrations, additive)
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
`lesson-plan-reports` (Lesson Planner); and the cross-cutting `standing-scores`, `report-quota`,
`seed-reports`, and `pacific-time`. The single `prisma/schema.prisma` now holds every table for
all of these; the schema names are the source of truth. Subsystems that are still deferred
(Library, Communication, Commission Marketplace, Certification Center, Payments) bring their own
tables when they land.

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
