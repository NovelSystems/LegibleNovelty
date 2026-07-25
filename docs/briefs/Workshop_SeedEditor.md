# Legible Novelty — Workshop: Seed Editor

**Task brief for Claude Code.** First of Workshop's three sub-stages (Seed Editor → Module Editor → Lesson Planner), named by artifact rather than numbered "Phase," since "Phase" already means something specific platform-wide (the AI-rollout tier — no AI anywhere in Phase 1, AI features in Phase 2). Don't reuse that word for these three builds.

**Explicitly provisional — expected to shrink.** The field list below is a starting point, not a settled spec. The actual authoring experience is a form with fields plus a large notes section, and the real work of this sub-stage is discovering which fields genuinely earn their place once someone is actually filling the form out, not building every field the source material lists just because it's listed. Treat the schema as easy to trim, not as a target to hit in full.

---

## Scope

**In scope:**
- Learning Seed schema (Section 5.1)
- Seed Taxonomy structure and placement/governance (Sections 6.1–6.3)
- Seed Chains (Section 6.4), including backend query support for the deferred curriculum map view
- Draft-sharing and comment-review workflow (Section 7.1)

**Explicitly deferred:**
- Everything Module- and Lesson-Plan-related — separate sub-stages, separate briefs.
- Endorsement itself (Library's job) — this sub-stage only needs to leave `seed_id` as a clean, stable FK target for Library's future Endorsement table.
- The curriculum map view itself — only its backend query support ships now.

---

## Tasks

### 1. Learning Seed schema

| Field | Type | Notes |
|---|---|---|
| `seed_id` | UUID/PK | |
| `architect_account_id` | UUID/FK | **No authoring gate.** Any Community Member can create a seed draft, no VE requirement, no threshold. "Seed Architect" is an earned display title (per Stage 1's derived-characteristics note: it's granted once a seed gets an educator endorsement), not a prerequisite to author one — consistent with the platform's general pattern of not gatekeeping creation. |
| `learning_objective` | text | Goal criterion, not a problem list |
| `entry_prerequisite` | text | |
| `algorithmic_constraints` | JSON/structured | **Genuinely unresolved — see Open Items.** Only illustrated for Math (numeric ranges like multiplier ∈ [2,9]) anywhere in the source material. No equivalent structure exists for Literacy or Science. This is exactly the kind of field this sub-stage's "shrink as we learn" process should resolve through actual use, not something to lock in from a cold spec. |
| `lesson_size_scope` | string/enum | Explicitly declared, not implicit |
| `subject` | FK → Taxonomy | |
| `topic` | FK → Taxonomy | |
| `grade_range` | text | Free-text description, deliberately not sortable (Section 6.3) |
| `target_learner_characteristics` | text, nullable | Optional |
| `associated_commission_id` | UUID/FK, nullable | Commission Marketplace isn't built yet — soft reference (plain UUID, no enforced FK) until it exists, same pattern as Stage 1's `lesson_plan_id` |
| `notes` | text | The "sizeable notes section" — deliberately unstructured, a catch-all for whatever the architect needs to capture that doesn't yet have its own field. Expect fields to migrate out of here over time as patterns emerge, not the reverse. |
| `status` | enum: draft / pending_review / published | |
| `deleted_at` | timestamp, nullable | Soft delete — same convention Stage 1 established for Account, reused here so deleting a seed can free a quota slot (Task 5) without losing the row for referential integrity |

### 2. Taxonomy structure and placement (Sections 6.1–6.3)

Two-level structure only: Subject → Topic, no third level (a deeper stage-within-topic structure was explicitly considered and rejected in the source material to avoid governance overhead and lock-in). Grade-independent — grade lives on the Seed, not the taxonomy.

- Subjects and Topics are admin-maintained. Verified Educators may propose new Topics; System_Admins approve. **The actual proposal-to-approval workflow is undecided** — see Open Items.
- Versioned: adding a Topic never breaks existing seed placements.
- Self-placement by the architect at creation; the endorsing VE confirms or flags placement as part of endorsement (Library's job to trigger — this sub-stage's comment system, Task 4, needs to already support that entry point).
- Architect can revise placement any time post-publication.

**Two placement-touching events, deliberately asymmetric — don't implement them identically.** An architect revising placement themselves, post-publication, based on community feedback, is a self-service correction: no status change, no return to Draft. A VE flagging placement during endorsement review is a formal objection: it forces the seed back to Draft via Task 4's comment mechanism, and stays there until the architect revises and resubmits. Same underlying field (subject/topic), two different consequences depending on who's touching it and why.

**Whether `pending_review → published` needs a human check is resolved in Task 5, not here:** it doesn't. Seed publication has no review gate; the quota mechanism is the actual control.

### 3. Seed Chains (Section 6.4)

Chains are defined at the seed level within a Topic — directed (Seed A points to Seed B), multiple competing chains can coexist in the same Topic, deliberately decoupled from taxonomy structure itself to avoid the lock-in a rejected earlier "slot" design would have created. Miscellaneous seeds associate with a topic via metadata ("enriches this content within Topic Y") rather than a chain relationship, since they enrich rather than advance.

**Backend must support coverage, gap, density, and language-coverage queries from day one**, even though the curriculum map view itself is deferred. This is a schema-design constraint now, not a feature to build — retrofitting these query patterns onto a schema that wasn't shaped for them is the failure mode being avoided.

### 4. Draft sharing and review workflow (Section 7.1)

Private to the architect by default. The architect invites specific registered accounts (never open share links) to view and leave threaded comments. The architect resolves or dismisses comments at their own discretion — no external edits ever merge into the draft directly. Share access auto-revokes on submission to Pending Review. Comment history is retained internally, never shown publicly on the published seed.

**Schema, not just prose — this wasn't given a table before:**

| Field | Type | Notes |
|---|---|---|
| `invite_id` | UUID/PK | |
| `seed_id` | UUID/FK | |
| `invited_account_id` | UUID/FK | |
| `invited_at` | timestamp | |
| `revoked_at` | timestamp, nullable | Set automatically on submission to Pending Review |

| Field | Type | Notes |
|---|---|---|
| `comment_id` | UUID/PK | |
| `seed_id` | UUID/FK | |
| `commenter_account_id` | UUID/FK | Either an invited draft-reviewer (this task) or, later, an endorsing VE (Library) — same table, same mechanism, don't hardcode the actor type |
| `body` | text | |
| `status` | enum: open / resolved / dismissed | Set by the architect, at their sole discretion |
| `created_at` / `resolved_at` | timestamp | |

**Build this generically enough that Library's future endorsement-return-to-draft flow can reuse it without modification.** When an endorsing Verified Educator has concerns, they leave a comment through this same system, the seed returns to Draft, the architect revises and resubmits. Endorsement itself is Library's decision to build; the mechanism it triggers into is this sub-stage's, and needs to already support that entry point without a schema change when Library arrives.

**No report-driven takedown path for Seeds specifically.** Section 10's moderation and report-takedown system is about Modules' domain-flavored content — Seeds "carry no domain flavor" (Section 5.1) and are minimal, reusable pedagogical objects. Nothing here needs its own Moderation Hold state or report threshold; that machinery belongs entirely to the Module Editor brief.

### 5. Publish quota — anti-spam, not human review

**This resolves the open question this brief previously flagged about whether seed publication needs a gate.** It doesn't need a review gate. Seeds aren't visible in Library and carry no domain flavor, so the risk isn't unsafe content, it's an unproven account flooding the pool with low-quality seeds. A quota does that job instead of a human reviewer:

- **Before an architect's first endorsement:** capped at 3 concurrently-published seeds (`status = published AND deleted_at IS NULL`), not a lifetime or daily count. Attempting to publish a 4th while already at 3 is blocked with a clear error. Deleting an existing published seed (setting `deleted_at`) frees a slot immediately.
- **After an architect's first endorsement** (a VE or LNC-status account endorses any one of their seeds, ever): the concurrent cap lifts entirely, replaced by a rate limit of 10 published seeds per day.
- **Track "has this architect ever had a first endorsement" as a cached boolean on Account** (`first_seed_endorsement_received`, default false), not a live join checked on every publish attempt. This is a hot-path check, same reasoning Stage 1 applied to indexing `email_hash`. The column lives on Account (Stage 1's table) but nothing in this stage sets it — Library's Endorsement logic does, once it exists. Add it via migration now regardless; this is ordinary additive schema evolution, exactly what Stage 0's Prisma/shadow-database setup exists to make cheap.
- **No separate counter/ledger table for the daily rate.** Seed publish volume per architect is small enough that a live count against `published_at` timestamps (seeds published by this account since the start of the current day) is sufficient — don't build tracking infrastructure a simple query already covers.

**One assumption stated rather than decided silently:**
- The quota applies uniformly to every account regardless of role — a Verified Educator authoring their own seed gets no exemption from the pre-endorsement cap. Not stated either way in the original request; flagging since it's a real design choice, not an obvious default.

**Daily reset: calendar day, midnight Pacific Time.** Use the `America/Los_Angeles` timezone identifier, not a fixed UTC offset — Pacific Time shifts between PST and PDT across the year, and a hardcoded offset will silently produce the wrong reset time for roughly half of it. This is a single, fixed reference point for every account, not localized to each architect's own timezone.

---

## Acceptance criteria

- `schema.prisma` includes real `LearningSeed`, `SeedChain`, `Taxonomy`, `SeedDraftInvite`, and `SeedDraftComment` models.
- The draft-sharing/comment workflow works end to end: invite, comment, resolve/dismiss, auto-revoke on submission.
- An architect's own post-publication placement revision does not change seed status; a VE's placement flag during endorsement (once Library exists to trigger it) does force a return to Draft through the same comment mechanism, and these two paths are tested separately, not assumed to behave the same way.
- Self-placement and endorsing-VE placement-flag-triggers-return-to-Draft both function through the same comment mechanism.
- Coverage/gap/density/language-coverage queries return correct results against the schema as built, even with no curriculum map UI to display them yet.
- `associated_commission_id` behaves correctly as an unenforced soft reference — no FK constraint exists yet, and nothing breaks in its absence.
- An account below its first endorsement is blocked from publishing a 4th concurrent seed, and deleting one of the existing 3 immediately frees a slot.
- Setting `first_seed_endorsement_received` to true (simulated, since Library's Endorsement logic doesn't exist yet to set it for real) removes the concurrent cap and replaces it with the 10-per-day limit, tested against both a day with fewer than 10 publishes (allowed) and a day already at 10 (blocked), with the daily count resetting at midnight Pacific Time (`America/Los_Angeles`), correctly across a DST transition, not just in the common case.

---

## Open items carried forward

- **`algorithmic_constraints`'s schema shape is genuinely unresolved.** Only ever illustrated for Math. This is the single biggest open modeling question in this sub-stage, and the expected mechanism for resolving it is actual use of the seed editor, not more up-front design.
- **`Taxonomy.topic.proposed_by` workflow** (how a VE's proposed Topic actually routes to admin approval) is undecided. The table can exist without this being resolved.
- **Resolved:** Seed publication needs no human gate — the quota mechanism (Task 5) is the actual anti-spam control instead.
- **Resolved:** daily reset is calendar day at midnight Pacific Time (`America/Los_Angeles`), a single fixed reference point, not per-architect local time.
- **The quota is assumed to apply uniformly regardless of role** (no VE/Admin exemption from the pre-endorsement cap) — not stated either way in the original request, worth confirming.
- **Field list is expected to shrink.** Don't treat a field's presence in this brief as evidence it should stay — the explicit goal of this sub-stage is finding out which fields the notes section should absorb instead.
