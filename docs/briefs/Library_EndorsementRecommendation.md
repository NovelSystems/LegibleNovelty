# Legible Novelty — Library: Endorsement & Recommendation

**Task brief for Claude Code.** First of Library's sub-stages, chosen deliberately over the rest of Library (Search/Ranking/Homepage/Quick Search, Reading mechanics, Big Questions) because this is the actual unblocker: more already-merged code is stubbed waiting on this than on anything else in the platform. Maps to the Endorsement/Community Recommendation half of Section 9.1–9.2 in the master design doc.

**This closes more forward-built loops than any prior sub-stage has.** Stage 1, Seed Editor, Module Editor, and Standing Scores all built hooks, stubs, and forward-referenced fields specifically waiting for this to exist. Wiring those correctly is as much the point of this brief as the Endorsement/Recommendation schema itself.

**One documented tension, not silently resolved either way:** Section 9.1 states zero-endorsement content is "fully accessible... never hidden." Module Editor's under-18 visibility gate (built later, addressing the residual risk Section 10.3 names) directly narrows that for minors specifically. Treat the age-gate as the operative, later-added exception to Section 9.1's original blanket statement — not a contradiction to reconcile, a revision to record.

---

## Scope

**In scope:**
- Endorsement schema and logic (Section 9.1): per-seed, VE-only, binary toggle, additive-only.
- Community Recommendation schema and logic (Section 9.2): per-module, binary toggle, eligibility-gated.
- The eligibility gate (Section 9.5: 7-day account age + completed profile) as a single shared, reusable function — comments and commission-support will call this same function once Communication and the Commission Marketplace gap exist, don't build a second version later.
- Wiring every currently-stubbed hook left waiting on this across Stage 1, Seed Editor, Module Editor, and Standing Scores (Tasks 4–6 below).
- The "public section" promotion logic — resolving Module Editor's open question about search-only vs. passive-discovery visibility.

**Explicitly deferred:**
- Sort Modes, Filters, Homepage Module List, Quick Search (Sections 9.3–9.7) — depend on Endorsement/Recommendation data existing, but are a different kind of build (query/ranking/UI, not the core trust actions themselves). Next Library sub-stage.
- Reading mechanics: Printable/Downloadable Format, Quiz/Test/Scoring, Progress Archive (Sections 7.3–7.5). Separate sub-stage.
- PDF cover generation (Section 15) — depends on the endorsement-status binary this brief produces, but is its own downstream artifact-generation concern. Worth noting Section 22 never explicitly assigns Section 15 to any subsystem, same category of gap as the earlier Taxonomy/Section-6 and Section-7-split imprecisions already caught in this project.
- Big Questions' read-only archive (Sections 11.1, 11.3) — depends on Communication's Post/thread schema, which doesn't exist yet. Same shape of forward-dependency as everything else in this project that's waited on a sibling subsystem.

---

## Tasks

### 1. Endorsement schema and logic (Section 9.1)

| Field | Type | Notes |
|---|---|---|
| `endorsement_id` | UUID/PK | |
| `seed_id` | UUID/FK | Per-seed, not per-module — a module's primary seed and each secondary seed carry independent endorsement state |
| `endorser_account_id` | UUID/FK | Must hold `ve_status = true` at time of action |
| `created_at` | timestamp | |

- **Only Verified Educators may endorse.** Check `Account.ve_status` at the moment of the action, not a cached assumption.
- **Binary toggle:** clicking again removes it (hard delete or a toggled-off state — a hard delete is simpler and there's no stated need to retain a removed endorsement's history the way `StandingScoreEvent` retains its append-only log).
- **No scope limits.** Any VE may endorse any seed regardless of their own grade-level or subject background — this was deliberately considered and rejected in the source material, don't add a filter here.
- **Additive only.** There is no reject/downvote action here at all — the only rejection path for published content is Module Editor's existing moderation system (Section 10.4, already built).
- **A secondary seed is "proposed" until independently endorsed**, at which point it behaves identically to an endorsed primary seed for search/ranking purposes (relevant to the next Library sub-stage, not this one, but the schema should support the distinction now).

### 2. Community Recommendation schema and logic (Section 9.2)

| Field | Type | Notes |
|---|---|---|
| `recommendation_id` | UUID/PK | |
| `module_id` | UUID/FK | Global to the module as a whole, not per-seed |
| `recommender_account_id` | UUID/FK | Must pass the eligibility gate (Task 3) |
| `created_at` | timestamp | |

Binary toggle, same click-again-to-remove behavior as Endorsement. No downvote mechanism.

### 3. Eligibility gate — one shared function (Section 9.5)

7 days account age + completed profile. This exact gate is reused by Community Recommendation now, and by module comments and commission-support later once Communication and Commission Marketplace exist — build it once as its own callable function, not inline logic duplicated at each call site. New accounts attempting a gated action before eligibility should see an onboarding-framed message ("explore modules during your first week"), not a bare rejection — this is a UI/copy concern for whoever builds the calling surface, but the function itself should return enough information to support that framing (e.g., days remaining, not just a boolean).

### 4. Wire Seed Editor's stubs

- **`Account.first_seed_endorsement_received`** (Stage 1/Seed Editor, currently always false, nothing sets it): flip to true the first time *any* seed authored by that account receives its first Endorsement. This is what ungates Seed Editor's publish quota from the 3-concurrent pre-endorsement cap to the 10/day post-endorsement rate — verify this by testing the actual quota transition, not just the flag flip in isolation.
- **`veFlagPlacement` → `SeedDraftComment`** (Seed Editor's stub entry point): when an endorsing VE has concerns about a seed's taxonomy placement as part of endorsement review, this should route through the existing comment mechanism Seed Editor already built generically for exactly this call. Don't build a second comment/flagging system — call the existing one.

### 5. Wire Module Editor's stubs

- **Endorsement/recommendation counts persisting across versions** (Module Editor Task 2): current-version count displayed in white, sum of all prior-version counts in light grey prefixed "+", sorting always uses the combined total. Endorsement/Recommendation records need to correctly attribute to the module version active at the time they were made, and the query that produces this white/grey split needs to be correct across a module that's been edited multiple times.
- **"Edited under you" warning** (Module Editor Task 2): once a module's current version has at least one Endorsement or Community Recommendation, any subsequent edit within the past hour should trigger this warning for the *next* person attempting to endorse or recommend, with a line-count delta. This brief's job is making sure Endorsement/Recommendation creation actually checks for and surfaces this condition — the edit-timestamp tracking itself is already built in Module Editor.
- **"Public section" promotion — resolves Module Editor's open question.** DSS's own trigger language ("the event that moves it to the public section") confirms there's a real distinction: before a module's primary seed has any endorsement, it's reachable only via search for 18+ accounts and invisible to under-18 accounts entirely (already built). **The first endorsement on a module's primary seed should promote it to full passive-discovery visibility** — browse, recommendations, homepage — for all users regardless of age. This is the resolution to the open question left in Module Editor's brief, not a new assumption; implement the actual promotion trigger here.

### 6. Wire Standing Scores' remaining triggers

Two of ESS's three triggers and all three of DSS's endorsement-related triggers were left explicitly unwired pending this sub-stage. Wire them now, reusing the exact shared Standing Score helper functions already on this branch — don't write parallel logic.

- **DSS +5** (module author): on a module's first Endorsement (the same event as Task 5's public-section promotion), apply DSS +5 to the module's `author_account_id`.
- **DSS +1** (seed author): for each module built on their seed that receives its first Endorsement — additive with the above; an account acting as both seed author and module author on the same module receives +6 total for that event, not two separate +5/+1 events that could be mistaken for a double-count.
- **DSS +0.1** (per recommendation): applied to the module's author for every Community Recommendation, not gated on any threshold.
- **ESS +5** (first endorser): paid to whichever VE was the *first* to endorse a module's primary seed, when that module reaches 10 Community Recommendations total. Track "who was first" — this needs the Endorsement record's `created_at` ordering, not just "an" endorser.
- **ESS -5** (endorsed module rejected after publication): this is the one Module Editor's existing Standing Score wiring didn't fully cover — the report/takedown system already applies DSS to the *author* and CSS to the *reporter*, but doesn't currently touch ESS at all. When a live, endorsed module is rejected on human review, apply ESS -5 to the VE who was the first endorser of that module's primary seed — same "first endorser" identification as the +5 trigger above. **Inference, not explicitly disambiguated in the source material:** if a module has multiple endorsed seeds (primary + secondaries) by different VEs, this penalty targets only the primary seed's first endorser, consistent with the primary seed being "what educator endorsement actually vouches for" per Module Editor's own schema notes — flag if a broader interpretation (every endorsing VE across all the module's seeds) was actually intended.

---

## Acceptance criteria

- `schema.prisma` includes real `Endorsement` and `CommunityRecommendation` models.
- Only accounts with `ve_status = true` can create an Endorsement; the check is live at action time, not cached.
- The eligibility gate is a single shared function, verified by confirming Community Recommendation calls it rather than reimplementing the 7-day/profile check inline.
- `first_seed_endorsement_received` flips correctly on an architect's first-ever seed endorsement, and the Seed Editor quota transition (3-concurrent → 10/day) is proven end to end, not just the flag in isolation.
- `veFlagPlacement` correctly routes through the existing `SeedDraftComment` mechanism — no second comment system.
- The white/grey endorsement-count split across module versions is correct for a module with more than one published version and endorsements/recommendations landing on different versions.
- The "edited under you" warning fires correctly when an edit lands within the hour before a subsequent endorsement/recommendation attempt, and does not fire otherwise.
- A module's primary seed's first endorsement correctly promotes it from search-only/under-18-blocked to fully passive-discovery-visible for all ages — test both the before and after state explicitly.
- DSS +5/+1/+0.1 and ESS +5/-5 all fire correctly, reusing the existing Standing Score helper functions (confirm this by checking the same functions are called, not duplicated), including the combined +6 case when one account is both seed and module author.
- ESS -5 targets the *first endorser of the primary seed* specifically, not every VE who endorsed any of the module's seeds.

---

## Open items carried forward

- **Section 9.1's "never hidden" language is now narrowed by Module Editor's under-18 gate** — documented here as a deliberate, later exception, not silently reconciled. Worth a one-line correction to Section 9.1 itself next time that section is touched.
- **ESS -5's "first endorser of the primary seed" targeting is an inference**, not explicit in the source material. Flag if endorsement of *any* of a module's seeds should trigger this penalty for that seed's specific endorser.
- **Section 15 (PDF Generation) isn't assigned to any subsystem in Section 22's map** — same category of gap as the Taxonomy/Section-6 omission caught earlier in this project. Not resolved here; flagged for whenever Section 22 next gets corrected.
- **Whether a secondary seed's endorsement should trigger its own version of the "public section" promotion**, independent of the primary seed's state, isn't addressed here — this brief only wires the primary-seed promotion, consistent with primary seed being the credential-bearing one, but the question of whether secondary-seed endorsement should do *anything* visibility-wise is untouched.

---

## Delivery notes (as built)

Implementation decisions and flags recorded at delivery, keyed to the open items above:

- **"Completed profile" defined** (Section 9.5 leaves it unspecified): verified email + at least one interest domain + at least one language preference, the fields the design consistently treats as "the user's profile." Single source of truth: `lib/eligibility.ts` (`isProfileComplete`). Adjust there if a different bar was intended.
- **Endorsement eligibility is VE-or-LNC (post-review correction).** Section 9.1's prose said "only Verified Educators," but Section 22's summary of the same section says "for Endorsement, VE/LNC status specifically" — Section 22's broader reading is correct (Section 4.3 grants LNC-holders the same endorsement ability), so the live check is `ve_status || lnc_status`. `lnc_status` has no source until Certification Center ships, so the LNC path is currently unreachable but implemented and tested (same discipline as building the DSS lock-check before anything could trigger a lock).
- **White/grey split cardinality.** Recommendations carry a `module_version` snapshot (per-module, like `ModuleReport`); endorsements are per-seed and shared across modules, so their split uses the current version's publish timestamp as the current/prior boundary. Both give the same current-vs-prior partition; `total` (all sorting uses it) is always exact.
- **"Edited under you" delta is measured in ELEMENTS (post-review correction).** Module content is page/element JSON with no "lines", so the warning quantifies change as the net `ModuleElement`-count delta since the current version's publish — the structural analog of a line delta the reviewer identified. A publish-time baseline (`ContextualizedModule.published_element_count`) is snapshotted in `publishModule`, and the warning reports `elementCountDelta` (current − baseline) plus `currentElementCount`. Two honest limits, both from Module Editor persisting no per-edit changelog: it is a NET count (pure in-place text edits, or equal add/remove churn, register as 0), and the baseline is publish-time (change on this version since it went live, surfaced alongside the within-the-hour recency trigger rather than a strict trailing-60-minute window). A character-level or true trailing-window delta would need an edit-diff baseline Module Editor does not keep.
- **Reward semantics.** DSS/ESS awards are append-only and not clawed back when an endorsement/recommendation is toggled off (consistent with the rest of Standing Scores). Visibility ("public section") IS state-derived and reverts if the last endorsement is removed. The ESS +5 first-endorser reward is latched (`ContextualizedModule.ess_first_endorser_rewarded`) so it pays exactly once regardless of toggle-driven threshold re-crossings, and settles whether the 10th recommendation or the first endorsement lands last.
