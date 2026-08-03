# Legible Novelty — Library: Search, Ranking, and Discovery

**Task brief for Claude Code.** Second of Library's sub-stages, building directly on Endorsement & Community Recommendation, which just landed. Maps to Sections 9.3–9.7 in the master design doc.

**Real dependency wrinkle, not a blocker but worth stating plainly:** Usage-based sort modes (Weighted/Unweighted Usage) need download counts and pass-grade completion counts. Neither exists yet, downloads depend on PDF Generation (Section 15, not built), completions depend on Quiz/Scoring (Section 7.4, deferred to the Reading-mechanics Library sub-stage). This brief builds the schema and formula for Usage sorts now, same forward-building pattern as everything else in this project, but they can't be meaningfully exercised until those two land. Test them against stubbed counts, the same way Lesson Planner's dashboard was tested against a stubbed completion signal.

---

## Scope

**In scope:**
- Sort Modes and their formulas (Section 9.3), including the AI Attestation multiplier (Section 9.4, which just needs to *read* `ContextualizedModule.ai_attestation`, already built, not add new schema for it)
- Filters (Section 9.5), reusing the eligibility gate, Taxonomy, and Endorsement status already built
- Homepage Module List (Section 9.6): cascading eligibility window, ranking, empty state
- Quick Search slide-out panel (Section 9.7): fields, cascading Subject→Topic, Context listbox, "Use my interests"
- Session-only cookie-stored filter state (no account required)
- Download-count tracking schema (populated by nothing yet — see dependency note above)

**Explicitly deferred:**
- Named filter presets (Section 9.5's own text: "deferred to the UI build phase," Section 18)
- Big Questions' read-only archive (Sections 11.1, 11.3) — depends on Communication's Post/thread schema, not built
- Reading mechanics themselves (Print/Downloadable, Quiz/Scoring, Progress Archive) — separate Library sub-stage, referenced here only as the source of the Usage-sort data this brief can't yet populate
- PDF Generation (Section 15) — same dependency note

---

## Tasks

### 1. Schema additions

| Field | Type | Notes |
|---|---|---|
| `ContextualizedModule.context_tag` | string/enum | Section 9.7: "each module carries exactly one Context tag." Not in Module Editor's original field list — add via migration. |
| `ContextualizedModule.download_count` | integer, default 0 | Nothing increments this yet (PDF Generation isn't built). |

Tracked signals already available: endorsement count (per seed, via `Endorsement`), recommendation count (via `CommunityRecommendation`), `ai_attestation` (already built). Completions with a passing grade depends on Quiz/Scoring (Section 7.4); build the Usage formula to reference a `passing_completion_count` field now, populated by nothing until that sub-stage exists — same pattern as `download_count`.

### 2. Sort Modes and the AI Attestation multiplier (Sections 9.3–9.4)

| Sort | Formula |
|---|---|
| Weighted Approval (default) | (endorsements × 3 + recommendations) × AI attestation multiplier |
| Unweighted Approval | endorsements × 3 + recommendations |
| Weighted Usage | (downloads + passing completions) × AI attestation multiplier |
| Unweighted Usage | downloads + passing completions |
| Recency | publication date, newest first, no score |

- All sorts carry an inversion toggle (↑↓) on the active sort.
- Multiplier: Wholly Human 10×, AI-Assisted with Manual Flair 2×, applies only to weighted formulas. Read `ai_attestation` directly.
- **Endorsements = endorsements on the module's PRIMARY seed.** Secondary-seed endorsements don't contribute to ranking.

### 3. Filters (Section 9.5)

- Interest domain / special interest tag → `context_tag`.
- Grade level → `LearningSeed.grade_range`, SUBSTRING match against free text (not numeric range); flag whether the non-sortable decision should be revisited.
- Subject / curriculum alignment → existing Taxonomy.
- Language → `LearningSeed.language`.
- Endorsement status → binary, ≥1 endorsement on the primary seed. No threshold.
- AI attestation tier → the two current values, or "all."
- Cookie-stored filter state: functional session cookie, no personal data, anonymous-friendly.

### 4. Homepage Module List (Section 9.6)

Cascading eligibility window (2 weeks → 2 months → anytime) over modules whose most recent Endorsement/Recommendation falls in-window; ranked by Weighted Approval; up to 20; static empty-state message. Open question (from source): domain-diversity capping — don't default it.

### 5. Quick Search slide-out panel (Section 9.7)

Language / Subject / cascading Topic / Context ARIA listbox (multi-select, OR within, AND across; `IN` check on the single `context_tag`) / Advanced link. "Use my interests" REPLACES the Context selection with `Account.interest_domains`; guest → disabled at load, logged-in → active, fetched at click time, empty → inline message. Open questions (from source): listbox collapse behaviour, loading indicator.

---

## Acceptance criteria

- All five sort modes return correctly ordered results, including inversion.
- The multiplier applies only to weighted sorts; a 10× Wholly-Human module with fewer endorsements can outrank a 2× AI-Assisted module with more.
- Usage formulas tested against stubbed counts.
- Every filter works independently and in combination; grade-level uses substring matching.
- Homepage cascade tested at all three tiers incl. the zero-result empty state.
- Quick Search Context OR-within / AND-across matches the advanced filter rule.
- "Use my interests" replaces rather than adds; guest/logged-in state tested.

---

## Open items carried forward

- Three open questions from the source, not defaulted: homepage domain-diversity capping, Context listbox collapse behaviour, "Use my interests" loading indicator.
- Grade-level filter exposes the `grade_range` free-text/non-sortable tension; built as substring, worth revisiting.
- `context_tag` and `download_count` (and `passing_completion_count`) are retroactive `ContextualizedModule` additions.
- Usage-sort formulas remain unexercisable with real data until PDF Generation and Quiz/Scoring land.

---

## Delivery notes (as built)

- **Sort/scoring** lives in `lib/search.ts` as a pure `scoreModule(sort, inputs)` plus `searchModules(filters, sort, { invert })`. The pure function makes the Section 9.4 worked example directly unit-testable: `(9×3)×10 = 270` (Wholly-Human) beats `(44×3)×2 = 264` (AI-Assisted) — the doc's "90 vs 88" is the same crossover with the ×3 and recommendations dropped for brevity. Endorsement counts are always on the module's primary seed; counts are combined-across-versions totals (sorting always uses the total, per the prior sub-stage).
- **AI-attestation multiplier** is `wholly_human: 10, ai_assisted_manual_flair: 2, ai_pipeline: 1`; a NULL attestation is treated as 1× (the neutral floor). AI Pipeline's 1× is from the doc. One place to adjust: `ATTESTATION_MULTIPLIER` in `lib/search.ts`.
- **GAP flagged (post-review): module submission does not enforce the AI-attestation declaration.** `ContextualizedModule.ai_attestation` is nullable and neither `submitForReview` nor `publishModule` requires it to be set, so the NULL multiplier case is genuinely reachable — Section 9.4's "must declare ... before the system accepts it" is not enforced at submission. This is a Module Editor gap; the ranking's 1× null handling surfaces it safely (an undeclared module gains no multiplier) but does not close it. Enforcing the declaration (and deciding on backfill for existing null rows) is a Module Editor change, left for confirmation, not made here unprompted.
- **Grade filter** is a case-insensitive `contains` against `LearningSeed.grade_range` (the live primary seed), NOT a numeric range — flagged, per the brief, as worth revisiting the non-sortable decision.
- **`passing_completion_count`** was added as a real `ContextualizedModule` column (same pattern as `download_count`) so the Usage formulas have a concrete field to read; nothing increments it yet.
- **Homepage** (`lib/homepage.ts`) draws its pool from the PUBLIC SECTION — published modules whose primary seed is endorsed (passive-discoverable, per the prior sub-stage; the homepage is explicitly a passive-discovery surface) — then applies the cascading recency window and ranks by Weighted Approval, reusing `search.ts`'s exact ranking rule. The cascade signal is the MORE RECENT of a module's latest endorsement and latest recommendation (`mostRecentSignalOf`), so a recommendation refreshes recency independently of endorsement age. `homepageModules(now, limit)` takes an optional limit (default 20) purely so the cap is exercisable in tests; production passes nothing.
- **Homepage test isolation (post-review):** the cascade-tier selection, the two-signal recency rule, and the empty-state mapping are extracted as PURE functions (`pickCascadeTier`, `mostRecentSignalOf`, `buildHomepageResult`) and unit-tested on synthetic inputs — deterministic, with no dependence on shared-table state or test-execution order. Because the homepage query is genuinely global (no filter), the DB-backed tests assert only properties robust to whatever other rows exist: set membership and the relative order of two specific modules, never exact global result sets or the globally-determined tier. The earlier approach (wiping the shared signal tables in `beforeEach` and leaning on serial file execution) has been removed.
- **Visibility gating in search** is left to the calling surface (via `lib/module-visibility`), so `searchModules` is a pure filter/rank over published modules and stays open to anonymous browsing per Section 1; the homepage, the age-sensitive surface, gates on passive-discoverability itself.
- **Cookie-stored filter state** is a frontend/session concern (no schema); the filter/sort primitives here are what it will persist and replay. The slide-out panel and ARIA listbox themselves are UI, deferred to the UI build phase (Section 18); their backend logic (cascading `topicsForSubject`, alphabetical `contextTagOptions`, `useMyInterests`) is built and tested.
