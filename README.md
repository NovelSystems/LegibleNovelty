# Legible Novelty — Library & Workshop

An open, donation-funded platform for community-authored educational modules that embed standard learning objectives inside a learner's special interest. It is built for autistic learners in particular — for whom a special interest is often the most reliable route into new material — but the approach is general: teach multiplication through trains, grammar through a favourite game, chemistry through cooking, without diluting the underlying academic objective.

The platform is named after the Legible Novelty framework (documented in the book of the same name), which treats a good learning artifact as one that is contextually immersive, recoverable, signaled, and bounded — novel and engaging on the surface, but legibly anchored to a concrete objective underneath.

**Status:** early build, core backend for Stage 0/1, all three Workshop sub-stages, Standing Scores, and the first two Library sub-stages is merged to `main`, with the frontend build phase underway. See [Build status](#build-status) for what exists and what's deferred; [`docs/briefs/`](docs/briefs/) for subsystem-level detail; [`docs/LN_Webapp_Design_v0.13.md`](docs/LN_Webapp_Design_v0.13.md) for the authoritative product spec.

## How it works

The platform's public-facing brand is split in two, and the codebase follows the same line:

- **The Library** is the unconditionally public reading experience — anyone can read any published module and its "Big Questions" archive with no account required. This is a non-negotiable design principle: a learner who needs these materials should never be blocked by account friction, a parent's inaction, or institutional access.
- **The Workshop** is the account-gated, contributor-facing side — authoring, the commission marketplace, and the contributor roles.

Content is produced from two linked artifacts:

| Artifact | Authored by | What it is |
|---|---|---|
| Learning Seed | Seed Architect | A reusable, domain-agnostic pedagogical unit: a learning objective stated as a goal criterion, its prerequisites, and the constraints a valid lesson must satisfy — carrying no domain flavour of its own. |
| Contextualized Module | Module Author | A Seed connected to a specific special-interest domain, drawing its examples and numbers from that interest while still satisfying the Seed's constraints. |

Verified Educators endorse seeds and modules as a positive trust signal — endorsement is additive and never a gate; nothing needs endorsement to be published or read. Quality surfaces through educator endorsement, community recommendation, and usage, not through mandatory pre-publication review.

For the complete design — roles, account lifecycle, moderation, commissions, notifications, payments, and the eight-subsystem map — see [`docs/LN_Webapp_Design_v0.13.md`](docs/LN_Webapp_Design_v0.13.md), the authoritative source for product behaviour. This README covers the repository and how to run it.

## Build status

A snapshot, not a full accounting. Each brief in [`docs/briefs/`](docs/briefs/) is the authoritative detail for its subsystem, including what's deferred and what's still open, don't look for that level of detail here.

### What exists today

Complete, tested against a fresh database (see [Running the checks](#running-the-checks)), and merged to `main`.

- ✅ **Stage 0 — Infrastructure substrate.** → [`docs/briefs/Stage1_User_Management.md`](docs/briefs/Stage1_User_Management.md)
- ✅ **Stage 1 — User Management.** Accounts, lifecycle, verification, badges. → [`docs/briefs/Stage1_User_Management.md`](docs/briefs/Stage1_User_Management.md)
- ✅ **Workshop — Seed Editor.** Learning Seed schema, Taxonomy, Seed Chains, publish quota. → [`docs/briefs/Workshop_SeedEditor.md`](docs/briefs/Workshop_SeedEditor.md)
- ✅ **Workshop — Module Editor.** Contextualized Module schema, lifecycle, governance/appeal. → [`docs/briefs/Workshop_ModuleEditor.md`](docs/briefs/Workshop_ModuleEditor.md)
- ✅ **Workshop — Lesson Planner.** Playlists, assignments, tracking dashboard. → [`docs/briefs/Workshop_LessonPlanner.md`](docs/briefs/Workshop_LessonPlanner.md)
- ✅ **Standing Scores (ESS / DSS / CSS).** Cross-cutting governance and trust scoring. → [`docs/briefs/StandingScores.md`](docs/briefs/StandingScores.md)
- ✅ **Library — Endorsement & Community Recommendation.** → [`docs/briefs/Library_EndorsementRecommendation.md`](docs/briefs/Library_EndorsementRecommendation.md)
- ✅ **Library — Search, Ranking & Discovery.** Sort/filter/homepage/quick-search. → [`docs/briefs/Library_SearchRankingDiscovery.md`](docs/briefs/Library_SearchRankingDiscovery.md)
- ✅ **Frontend foundation & Seed Editor UI.** The design-token system (Atkinson Hyperlegible / Lora, logo-derived palette, provisional pending a committed logo source), shadcn/ui wired to those tokens, and the Seed Editor screens under `/seeds`. No dedicated brief yet, this is the UI build phase's first screen.

**Deferred:** the rest of Library (reading mechanics, PDF generation, named filter presets), Communication, Commission Marketplace, Certification Center, Payments & Billing, DEF Arbitration Phase 2. Each has already-built code pointing at a stub for it — see the relevant brief's "Explicitly deferred" section before assuming a "complete" piece does something it doesn't yet.

**Open design questions and unconfirmed inferences** for each subsystem live in that subsystem's brief, under "Open items carried forward." Read them before changing behavior that looks arbitrary, it may be a documented inference, not an oversight.

### Branch and PR state

Everything above is merged to `main` — `main` is the source of truth for current state. Work happens on short-lived feature branches, validated with `scripts/check.sh` and merged via PR; nothing is pending on a long-lived branch. "Complete" means built, migrated, and passing `scripts/check.sh` on `main`, not released, production hosting is still deferred.

### Two boundaries worth knowing up front

- **All AI functionality is Phase 2.** Phase 1 ships every feature as a fully manual process with the same user-facing outcome, no automated review or screening anywhere on the platform yet.
- **Production hosting is deliberately deferred.** The target (Hetzner VPS, managed PostgreSQL) is decided but intentionally not built, revisited once the financial picture is clearer. Stage 0 is local-only by design.

For implementation-level gotchas (how the Standing Score latch works, why Module pins to a SeedRevision and LessonPlan deliberately doesn't, and similar patterns worth knowing before touching this code) see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

| Concern | Stage 0 (local, now) | Production target (deferred) |
|---|---|---|
| Runtime | Node.js 24 (Active LTS), pnpm 9 via Corepack | same |
| Framework | Next.js 16 (App Router), React 19, Tailwind CSS v4 + shadcn/ui | same |
| Auth | Auth.js — database sessions, `@auth/prisma-adapter` | same, session store stays PostgreSQL (Redis path left open) |
| ORM / DB | Prisma → PostgreSQL 17 (Docker), UTF-8 | Prisma → managed PostgreSQL, UTF-8 |
| Email | Mailpit local catcher (SMTP + REST API) | Resend, via the Auth.js email adapter — a config swap, not new code |
| Editor | — (TipTap, when authoring is built) | TipTap |
| Payments | — (Stripe, when billing is built) | Stripe |
| Hosting | Docker Compose on your machine | Hetzner VPS, Nginx, PM2, Let's Encrypt |
| CI | `scripts/check.sh`, run manually | (GitHub Actions deliberately deferred) |

Database sessions (not JWT) are a hard requirement, not a default: they're revocable, which Stage 1's account-deletion and parent/child access-revocation flows depend on.

## Local development

Everything runs in Docker, so results reflect how the app actually runs rather than whatever state your host machine happens to be in.

### Prerequisites

- Docker and Docker Compose (v2). The only hard requirement.
- Optional, for running tooling outside the container: Node 24 (see `.nvmrc`) with Corepack enabled (`corepack enable`) — the pinned pnpm version comes from `package.json`'s `packageManager` field.

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
| `app` | http://localhost:3000 | Next.js dev server |
| `mailpit` | http://localhost:8025 | Web UI for inspecting caught email; SMTP is internal on 1025 |
| `postgres` | (internal only) | Not exposed to the host by default; add a `ports:` mapping if you want direct access |

Three logical databases are provisioned automatically on first start: the main database, a shadow database (for `prisma migrate dev`), and a dedicated test database.

### Running the checks

`scripts/check.sh` is the manual stand-in for CI — run it before merging. From a clean slate it rebuilds the Docker images, brings Postgres and Mailpit up healthy, installs dependencies, lints, type-checks, applies migrations and runs the test suite against the test database, and produces a production build, printing a full pass/fail/skipped summary at the end (it does not stop at the first failure).

```bash
./scripts/check.sh
```

> ⚠️ Do not run `check.sh` while a separate `docker compose up` dev session is active. The script tears down all containers and volumes (`docker compose down -v`) at its start and end, which will destroy that session's data, including your dev database.

### A note on dependencies

`node_modules` lives in a named Docker volume layered over the project bind mount, so the host directory never shadows the dependencies (and generated Prisma Client) the image built. The tradeoff: after changing dependencies in `package.json`, a plain restart won't pick them up, rebuild with `docker compose down -v` and bring the environment back up.

## Project layout

```
.
├── app/                     # Next.js App Router (routes, actions, components)
│   └── api/auth/[...nextauth]/route.ts
├── auth.ts                  # Auth.js config: Account-backed adapter + database sessions
├── lib/                     # Service layer — one module per feature area
├── prisma/
│   ├── schema.prisma        # Full schema — table names are the source of truth
│   └── migrations/          # Committed migration history
├── db/init/                 # Postgres init (shadow + test databases, UTF-8)
├── tests/                   # Vitest suite
├── docs/                    # Authoritative specs: LN_Webapp_Design, briefs/, ARCHITECTURE.md
├── scripts/check.sh         # Manual CI substitute
├── docker-compose.yml       # postgres + app + mailpit
├── Dockerfile               # node:24-alpine + Corepack
└── .env.example             # Documents required environment variables
```

## Environment variables

`.env` is gitignored and must never be committed. `.env.example` documents everything; the two required by `check.sh` are:

- `DATABASE_URL` — main application database.
- `TEST_DATABASE_URL` — dedicated test database (migrations and tests run here).

Also used: `SHADOW_DATABASE_URL` (for `prisma migrate dev`), `AUTH_SECRET` / `AUTH_TRUST_HOST` (Auth.js), and the Postgres and Mailpit connection settings.

## Contributing

Work happens on feature branches and is validated with `./scripts/check.sh` before merge, no external accounts or services are needed to run the full check locally.

## License

GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE).

AGPL is a deliberate choice: it closes the "SaaS loophole" so that anyone running a modified version of this platform as a hosted service must also open-source their modifications, protecting a donation-funded public good from being forked into a closed competitor.
