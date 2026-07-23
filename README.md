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

> **Status:** early build. The design is fully resolved at the specification level; the code
> is at **Stage 0 — the local development substrate everything else runs on**. See
> [Build status](#build-status) for what exists today versus what is designed but not yet
> built.

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

The project is built in stages. **Stages 0 and 1, plus the Workshop Seed Editor, are
complete.** Everything below them is designed and specified, not yet implemented.

- ✅ **Stage 0 — Infrastructure substrate.** A fully local, zero-cost
  Docker environment: PostgreSQL, the Node application container, and a Mailpit email catcher;
  Auth.js wired for revocable **database sessions** via the Prisma adapter; a single-command
  check script standing in for CI. No cloud accounts or paid services required to run it.
- ✅ **Stage 1 — User Management _(this repo, today)_.** The real `Account` schema and
  identity substrate built on Stage 0's revocable sessions: core authentication (signup,
  login/logout, password reset, email verification); the account lifecycle (dates of birth,
  child sub-accounts, automatic graduation, parent dormancy/deletion, deactivation, purge and
  reclaim, platform-wide display-name reuse blocking); Connection/ParentApproval; Share Contact
  Information; Verified Educator verification (institutional/directory, license-holder, and
  peer-token paths) with peer-token accountability; account status badges; an Awards backend
  schema (no user-facing surface); and the seven account/authentication email triggers. The
  Awards **frontend** and business logic remain deferred.
- ✅ **Workshop — Seed Editor _(first of three Workshop sub-stages)_.** Learning Seed schema
  (no authoring gate), the two-level Subject→Topic Taxonomy, Seed Chains with backend
  coverage/gap/density/language-coverage queries (the curriculum-map view itself is deferred),
  the private draft-sharing/comment workflow (invite-only, threaded, auto-revoke on submission),
  the two asymmetric placement paths (self-service revision vs. endorsement placement-flag
  return-to-Draft), and the anti-spam publish quota (3 concurrent pre-endorsement → 10/day
  after, resetting at midnight `America/Los_Angeles`). Module Editor and Lesson Planner remain
  deferred; Endorsement itself is Library's.
- ✅ **Standing Scores (ESS / DSS / CSS) — cross-cutting governance.** One shared
  `StandingScore` table (score_type discriminator, decimal value) with lazy read-time weekly
  drift (no scheduler), a 0-lock with per-score consequences, uniform restoration to 5, and an
  append-only `StandingScoreEvent` infraction record. Wired against what exists: ESS lock
  revokes `ve_status`/`lnc_status` (and a confirmed `ve_conduct_review` flag now triggers it
  directly); DSS lock is retrofitted into the Seed Editor authoring/publish path; a new
  `SeedReport` path closes the free-text vandalism gap, resolving through the existing
  SeedRevision moderator-edit system. Module Editor / Library triggers remain unwired.
- ⬜ **Later subsystems.** Library (browse/search/reading, endorsement, lesson plans),
  Workshop (seed & module authoring, commission marketplace, moderation), Certification Center
  (the LNC mini-LMS), Communication (comments, Big Questions, forum), Notification, and
  Payments & Billing.

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
├── lib/                     # Stage 1 service layer (accounts, lifecycle, verification, …)
├── prisma/
│   ├── schema.prisma        # Stage 1: Account + full User Management schema
│   └── migrations/          # Committed migration history
├── db/init/                 # Postgres init (shadow + test databases, UTF-8)
├── tests/                   # Vitest: auth, lifecycle, VE flows, flags, badges, email
├── scripts/check.sh         # Manual CI substitute
├── docker-compose.yml       # postgres + app + mailpit
├── Dockerfile               # node:24-alpine + Corepack
└── .env.example             # Documents required environment variables
```

Stage 1 replaces Stage 0's placeholder `User` with the real `Account` model and the rest of
the User Management schema (Connection, ParentApproval, VerificationApplication, TokenGrant,
AccountFlag, TokenRequestThread, and the Awards backend tables). The real seeds,
modules, and everything else arrive with their respective subsystems.

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
