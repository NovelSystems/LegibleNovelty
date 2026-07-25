# Legible Novelty — Workshop: Lesson Planner

**Task brief for Claude Code.** Third of Workshop's three sub-stages. Builds Section 12.1 (Lesson Plans).

**Boundary reversal, recorded here since it isn't reflected anywhere else yet.** Section 22's system map assigns Lesson Plans to Library, reasoned explicitly as "curating existing modules is content interaction, not generation... a Verified Educator who only assigns lesson plans shouldn't need to be a Workshop user." That reasoning is being deliberately overridden: Lesson Plans are built as part of Workshop instead. This means a VE who only wants to assign lesson plans will need Workshop access going forward — a real consequence of this reversal, not a side effect to ignore. Section 22 should get a correction reflecting this the next time it's touched.

**This closes a loop from Stage 1.** `ParentApproval.lesson_plan_id` was built as an unenforced UUID (no FK constraint) specifically because `LessonPlan` didn't exist yet. Once this sub-stage's schema lands, add the real foreign-key constraint via migration — that was always the plan, and this is the point it becomes possible.

---

## Scope

**In scope:**
- Lesson Plan schema and creation (playlist model: ordered list of published modules, live references, no version pinning)
- Creator/assigner distinction as separately tracked roles
- Assignment objects (lesson plan + assigner + assigned learner(s) + date range, each instance its own record)
- `LessonPlanReport` mechanism — a real gap this brief closes, not something the original draft specified. Reuses the CSS reporting pattern already established for seeds and modules.
- Tracking dashboard: per-learner, per-module completion status, filterable by date range
- Completion submission prompt on module finish

**Explicitly deferred:**
- Actual completion/scoring data itself. The tracking dashboard's real content depends on Library's Progress Archive (Section 7.5) and Quiz/Scoring mechanics (Section 7.4), neither built yet. This sub-stage builds the dashboard's schema and query shape against a stubbed completion signal, the same pattern used for other forward-built features in this project.
- Big Questions' interactive mechanic — the read-only archive is Library's, the submission/participation mechanic is Communication's, per existing subsystem assignments. Not touched here.
- Any VE-status requirement on creation or assignment — deliberately not gated, see Task 1.
- DSS gating on lesson plan creation — deliberately not applied, see Task 1.

---

## Tasks

### 1. Lesson Plan schema

| Field | Type | Notes |
|---|---|---|
| `lesson_plan_id` | UUID/PK | This is what Stage 1's `ParentApproval.lesson_plan_id` should get its real FK constraint pointed at, via migration, once this table exists |
| `creator_account_id` | UUID/FK | Any community member — no role restriction, no VE requirement |
| `title` | string | |
| `module_sequence` | ordered array/join table of module_id | Add, remove, reorder — a playlist, not a formal curriculum object. **References the live `module_id`, not a pinned version or revision.** Unlike Module's pin to a specific `SeedRevision`, this deliberately always reflects the module's current published state — confirmed, not inferred: curation is the point of this feature, so a lesson plan should track what a module currently is, not freeze a snapshot of what it was when added. |
| `is_public` | boolean | Publishable as searchable and publicly accessible |
| `created_at` | timestamp | |

No content restriction or quality gate at creation — consistent with the platform's general pattern of letting usage signal quality rather than gatekeeping creation. A poorly constructed lesson plan simply won't get assigned or used.

**DSS does not gate lesson plan creation — decided, not an oversight.** DSS's definition (Standing Scores) is specifically Seed Architect and Module Author activity. Lesson plan creation is curation of already-vetted, already-published content, not authoring new pedagogical material, so a DSS-latched account should still be able to create and assign lesson plans. This is a reasoned distinction, not a silent omission — flag if lesson plan creation was actually meant to count as "building tools" under DSS's broader framing.

### 2. Assignment objects

**Creator and assigner are distinct, separately tracked roles.** The creator owns authorship credit. The assigner is whoever assigns a (possibly someone else's) published lesson plan to specific learners — a teacher may build their own, or find and assign a colleague's. These are different relationships with different data implications, not the same record viewed two ways.

**Assigning does not require Verified Educator status.** Deliberate inclusion decision, extending the feature to homeschooling parents, tutors, and other informal teaching relationships that don't fit the credentialed-teacher model.

| Field | Type | Notes |
|---|---|---|
| `assignment_id` | UUID/PK | Each assignment instance is its own object — not merely "lesson plan published" |
| `lesson_plan_id` | UUID/FK | |
| `assigner_account_id` | UUID/FK | Not necessarily the creator |
| `assigned_learner_ids` | array of UUID/FK | |
| `date_range_start` / `date_range_end` | date | Supports reusing the same lesson plan across multiple cohorts/years without conflating data between them |

### 3. New: lesson plan title reporting — same free-text gap Seeds had, more urgent here

**This wasn't in the original brief and should have been.** `title` is open free text, and unlike Seeds (which had almost no visibility until Library existed), a `LessonPlan` with `is_public = true` is immediately, directly searchable the moment it's created. This is the same vandalism gap `SeedReport` closed, but with less excuse for having missed it and more real exposure.

**`LessonPlanReport`:** `report_id` (PK), `lesson_plan_id` (FK), `reporter_account_id` (FK), `reason` (text), `status` (enum: pending/resolved), `created_at`, `resolved_at`, `resolved_by` (FK, Moderator). Same lightweight shape as `SeedReport` — no auto-escalation ladder, a report surfaces to a Moderator who can directly correct the title or deactivate the lesson plan (`is_public` forced false), proportionate to a simple two-field object rather than building a revision-history system to match Seed's.

**Standing Score consequences use CSS on both sides, not DSS — since lesson plan creation isn't a DSS-tracked activity (Task 1), CSS is the consistent choice for consequences to the creator too, not just the reporter:**
- Reporter: +5 CSS if the report results in a correction or takedown, -2 CSS if deemed unfounded and the lesson plan is retained as-is — mirroring `SeedReport`'s tiers exactly.
- Creator: this is new scope, not in the Standing Scores brief, since lesson plans didn't exist as a reportable type yet when that brief was written. Proposed, not confirmed: mirror CSS's existing "own comment reported and removed" tiers (-5 standard, -20 egregious) rather than DSS's 0/-10/-20 tiers, since the creator isn't in DSS's tracked population here. Flag if a different consequence was intended.
- Counts toward the same combined daily report cap as comments, modules, and seeds.

### 4. Tracking dashboard

Shown to the assigner (not necessarily the creator): per-learner, per-module completion status, filterable by date range. Built against a stubbed completion signal for now, since the real data source (Library's Progress Archive) doesn't exist yet — same testing pattern used elsewhere in this project for features built ahead of their data dependency. Don't block this sub-stage on Library shipping first; verify the dashboard's query shape and filtering logic work correctly against mock completion data.

### 5. Completion submission prompt

When a learner finishes a module reached via lesson plan assignment, they're automatically prompted to send results to whoever assigned it to them, subject to the same logged-in/verified-account gating Section 7.4 describes for quiz submission generally. The gating logic itself belongs to Library (Section 7.4); this sub-stage only needs the prompt-trigger and submission-routing to exist, keyed off the assignment relationship built in Task 2.

---

## Acceptance criteria

- `schema.prisma` includes real `LessonPlan` and `LessonPlanAssignment` models.
- `Account.ve_status` is not checked anywhere in creation or assignment logic — confirm the absence of a gate, not just the presence of one.
- Multiple assignment instances of the same lesson plan, to different cohorts with different date ranges, don't conflate completion data between them.
- The tracking dashboard's filtering (by date range, by learner, by module) works correctly against stubbed completion data.
- `ParentApproval.lesson_plan_id`'s foreign-key constraint is added via migration once `LessonPlan` exists, closing Stage 1's open soft reference.
- Editing a module referenced by a `LessonPlan` (new version, per Module Editor's version-increment) is reflected immediately in every lesson plan that references it — no stale pinned reference anywhere.
- Filing a `LessonPlanReport` correctly surfaces to a Moderator; resolving it via title correction or deactivation applies the correct CSS adjustment to both the reporter and the creator. A report counts toward the same combined daily cap as comment/module/seed reports.
- A DSS-latched account can still create and assign lesson plans — confirm the absence of a gate, not just its presence, same discipline as the existing `ve_status` criterion above.

---

## Open items carried forward

- **Section 22 needs a correction**, separate from this brief: Lesson Plans move from Library to Workshop, reversing its stated rationale. Record this the next time that section is touched, so a future reader doesn't build against the old assignment.
- **The tracking dashboard's real value is gated on Library's Progress Archive and Quiz/Scoring mechanics.** This sub-stage can ship complete and tested against stubbed data, but won't show anything meaningful in production use until those land.
- **The creator-side CSS penalty tiers for a corrected/removed lesson plan (-5/-20, mirroring CSS's existing "own comment removed" pattern) are proposed, not confirmed.** New scope this brief adds; flag if a different consequence was intended.
- **Whether lesson plan creation should count as DSS-gated "building tools" activity is a reasoned judgment call, not something explicitly settled anywhere.** Built as not-gated here; revisit if that reasoning doesn't hold up.
