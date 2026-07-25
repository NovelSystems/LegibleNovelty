# Legible Novelty — Standing Scores (ESS, DSS, CSS)

**Task brief for Claude Code.** Cross-cutting infrastructure, not a Workshop sub-stage. Touches three things at once: Stage 1 (Account, TokenGrant, AccountFlag — already merged), Seed Editor (already merged — needs a retrofit, not just new code), and forward hooks for Module Editor and Library (neither built yet). Source: `LN_Content_Governance_Policy_v1.md`, Section 10.

**This requires changing already-merged Seed Editor code, not just adding new schema.** DSS's 0-lock revokes "access to building tools (seed and module authoring)." Seed Editor currently has zero Standing Score awareness. That's a live gap, not a future concern.

---

## Scope

**In scope:**
- Shared mechanic: one `StandingScore` table (score_type discriminator: ESS/DSS/CSS), not three parallel systems, since all three share the same scale, drift, lock, and restoration behavior.
- Lazy weekly drift computation — no new scheduler.
- Historical Infraction Record (Section 10.6), append-only, moderator-attributed.
- ESS triggers that can wire up against what's already built (VE token rescinded, tied to Stage 1's `TokenGrant`/`AccountFlag`), plus the 0-lock write to `Account.ve_status`/`lnc_status`, plus restoration logic.
- DSS's 0-lock, retrofitted into Seed Editor's existing authoring/publish path on the already-merged branch.
- CSS schema and the report-quota mechanic (3/day combined), reusing the calendar-day-at-midnight-Pacific convention already established for Seed Editor's publish quota.
- New `SeedReport` mechanism (Task 5) — a real gap this brief closes, not something the source document specified. Seeds' free-text fields had no report path at all; resolution routes through the already-built `SeedRevision` moderator-edit system.

**Explicitly deferred — schema exists, triggers don't fire yet:**
- ESS's "-5, module rejected after publication" and "+5, first endorser at 10 recommendations" — depend on Module Editor's takedown system and Library's Endorsement/CommunityRecommendation tables, neither built.
- DSS's endorsement-triggered +5/+1 payouts and the +0.1-per-recommendation trigger — same dependency.
- DSS's "module rejected on human review" tiers — depends on Module Editor's takedown system.
- CSS's report-outcome triggers (comment/module reported, retained or rejected) — depend on Module Editor's and Library's comment/report systems.
- LNC restoration's "retake and pass the free certification test" — depends on Certification Center, not built.
- AI-assisted historical-record summarization (Section 10.6) — explicitly future work in the source document, consistent with the platform-wide no-AI-in-Phase-1 rule.

---

## Tasks

### 1. Shared schema

**StandingScore:**

| Field | Type | Notes |
|---|---|---|
| `standing_score_id` | UUID/PK | |
| `account_id` | UUID/FK | |
| `score_type` | enum: ESS / DSS / CSS | One row per (account, type) pair, not three columns on Account — same type-discriminator pattern used elsewhere in this project (`AccountFlag.flag_type`, `AwardInstance.target_id`, `ModuleElement.element_type`) |
| `current_value` | decimal, not integer | DSS has a +0.1 trigger — an integer column would silently round this away |
| `locked_at` | timestamp, nullable | Set when value hits 0 |
| `last_drift_computed_at` | timestamp | Used by the lazy drift calculation (Task 2), not a display field |

**StandingScoreEvent** (the Historical Infraction Record, Section 10.6):

| Field | Type | Notes |
|---|---|---|
| `event_id` | UUID/PK | |
| `account_id` | UUID/FK | |
| `score_type` | enum: ESS / DSS / CSS | Which score this entry affected |
| `point_delta` | decimal | Positive or negative |
| `event_type` | string/enum, extensible | e.g. `ve_token_rescinded`, `module_rejected_inappropriate` — extensible for triggers wired up later. **Correction from an earlier draft of this brief:** DSS's module-author +5 fires on a module's *first endorsement* (the event that moves it to the public section). ESS's separate +5 fires on the *same module later reaching 10 community recommendations*, credited to whoever was its first endorser. These are two different triggers on two different scores, not one combined event — an earlier version of this brief incorrectly merged them into a single sentence. |
| `moderator_account_id` | UUID/FK, nullable | Required whenever this entry results from a moderator's retain/reject decision |
| `explanation` | text, required when `moderator_account_id` is set | Section 10.6: "a required written explanation" for every moderator-driven entry — this is an accountability record for the moderator, not just the account holder |
| `created_at` | timestamp | Append-only — never updated or deleted |

Both tables are invisible to the account holder — internal moderation-triage data only, per Section 10.1.

### 2. Weekly drift — lazy computation, no scheduler

**Design decision, not left open:** compute drift at read time, not via a recurring job. Whenever a `StandingScore` row is read (for a permission check or moderator view), compute whole weeks elapsed since `last_drift_computed_at`, apply the cumulative drift (below 50: +1/week, at 50: +0, above 50: -1/week, stopping at 50 rather than overshooting), write the updated `current_value` and a fresh `last_drift_computed_at`, then return the current value. Same reasoning as the Seed Editor's daily quota using a live count instead of a ledger table — don't stand up scheduling infrastructure a query-time calculation already covers. This also sidesteps the scheduler question that's been open since Stage 1's grade-auto-increment item, for this feature at least.

**Restoration interacts with drift, not around it:** on successful appeal, `current_value` resets to 5 (not 0), and `last_drift_computed_at` resets to the appeal's resolution time. The "clean first week" rule (Section 10.2) needs no special-case code — it falls out of the drift arithmetic naturally: a week of undisturbed drift takes 5 to 6, and a subsequent -5-class infraction lands at 1 (above floor, absorbed) rather than 0 (re-floored) had it happened immediately at 5. Verify this with a test, don't hand-roll a separate "within first week" flag.

### 3. Locking and forced review

Reaching 0 sets `locked_at` and triggers forced moderation review (create a `StandingScoreEvent` marking the lock, `moderator_account_id` null since this is system-triggered, not a moderator decision). A Moderator may also trigger discretionary review at any value — build this as a direct action, independent of the 0-floor path. While locked, further infractions still create `StandingScoreEvent` rows (the record keeps logging per Section 10.6) but must not move `current_value` below 0.

**Per-score lock consequences:**
- **ESS lock:** `Account.ve_status` and `Account.lnc_status` (Stage 1's existing fields) both set false, regardless of which was held. Restoration: successful appeal, then a fresh `TokenGrant` from a VE account whose `account_id` is not the same as the `granting_account_id` on this account's original `TokenGrant` — query Stage 1's existing table, don't add a new field to track this. **A confirmed `ve_conduct_review` `AccountFlag` (Stage 1) also triggers this lock directly** — resolved: rather than a specific numeric point deduction (none was given), treat confirmation as its own direct lock trigger, setting `locked_at` immediately. Restoration is identical regardless of which trigger caused the lock — reset to 5, unlock, resume drift — per the uniform restoration behavior confirmed below.
- **DSS lock:** blocks seed and module authoring entirely — see Task 4 for the Seed Editor retrofit specifically.
- **CSS lock:** blocks reporting and commenting functions (Module Editor/Library's job to enforce once those exist; this task only needs the lock state itself to be correct and queryable).

**Restoration is identical across all three scores and all lock causes, confirmed.** Set to 5, unlock, resume passive drift — the same process regardless of whether the lock came from a numeric point trigger reaching 0 or a direct trigger like `ve_conduct_review` confirmation. Don't build per-score or per-cause restoration variants.

### 4. Retrofit: Seed Editor's authoring path

**This is a change to already-merged code, not new-build scope.** Add a DSS check to the existing seed-authoring path (`lib/quota.ts` or wherever seed creation/publish is gated): before allowing any seed creation or publish action, check the acting account's DSS `StandingScore`. If locked (`locked_at` is not null), reject the action outright — this check is independent of and takes priority over the existing 3-concurrent/10-per-day quota tiers, not a fourth tier alongside them. A DSS-locked account is blocked regardless of quota standing.

Moderator-authored `SeedRevision` edits (the controlled-document revision system) are unaffected by this — the DSS check applies to authoring/publishing a seed under one's own name, not to a moderator's accountability-edit action, which already has its own separate permission check.

### 5. New: seed content reporting — the free-text vandalism gap

**This wasn't in the original brief and should have been.** Seed Editor was built without any report path on the reasoning that seeds carry no domain flavor. That reasoning addressed a different risk (inappropriate domain-flavored content) and never accounted for the much more basic one: any free-text field (`learning_objective`, `entry_prerequisite`, `target_learner_characteristics`, `notes`) can simply be filled with garbage or profanity regardless of subject matter. That needs a removal path, and the discovery half of that path was missing entirely.

**Proposed design, not yet confirmed — this connects to an open question from the previous draft of this brief.** The "Seed rejected on human review" DSS tiers (0/-10/-20) never had a clear mechanism behind them. This report path is likely it:

- New `SeedReport` table: `report_id` (PK), `seed_id` (FK), `reporter_account_id` (FK), `reason` (text), `status` (enum: pending/resolved), `created_at`, `resolved_at`, `resolved_by` (FK, Moderator). Deliberately lighter than Module's eventual report system, no auto-escalation ladder (1 report/2 reports), since curse-word-in-a-field vandalism doesn't carry the same risk profile as inappropriate domain content and doesn't need automatic takedown, just correction.
- A report surfaces to Moderators. Resolution happens through the **already-built `SeedRevision` moderator-edit path** — no new removal mechanism needed, the tool already exists, it just never had a discovery trigger pointing at it.
- **CSS trigger, mirroring "report a comment" as the closest severity match:** +5 CSS if the report results in a moderator correction, -2 CSS if the report is deemed unfounded and content is retained as-is. Counts toward the same combined 3-per-day report cap as comments and modules (Task 6).
- **DSS trigger on the architect, using the existing unexplained tiers:** if a moderator's correction is severity-classified as insufficiency (0, no penalty — a good-faith error), inappropriate (-10), or egregious (-20), apply that tier to the seed's `architect_account_id`. This is the proposed resolution to this brief's earlier open question, not a confirmed one — flag if a different mechanism was actually intended for those DSS tiers.

**Who can file a report right now is genuinely limited by what's built.** Only the architect and invited draft-reviewers (`SeedDraftInvite`) can currently see a seed's content pre-publication; almost no one can see it post-publication until Module Editor or Library exist and expose seed content contextually through a module. Build the mechanism now regardless — same forward-built pattern as everything else in this project that's ready before its consuming surface exists — but its practical reach is limited until those land.

### 6. Report quota (CSS, Section 10.5)

3 reports per day, combined across comments, modules, **and now seeds** (Task 5) — same calendar-day-at-midnight-Pacific reset as Seed Editor's publish quota (`America/Los_Angeles`, DST-correct). This wasn't restated in the source document, but reusing the established convention rather than inventing a second reset rule is the right call given there's already one precedent in this codebase.

---

## Acceptance criteria

- `schema.prisma` includes real `StandingScore` and `StandingScoreEvent` models — no placeholders.
- **Corrected — all three scores apply to every account simultaneously, always, not conditionally.** Confirmed: CSS is not restricted to accounts lacking VE/LNC/Developer status. A VE who also authors content still gets hit on CSS for a bad comment; the three scores are orthogonal, not a progression where gaining one status retires another. Section 10.5's "for accounts without VE, LNC, or Developer credentials" describes CSS's typical/primary population, not an eligibility gate. Whether rows are created eagerly at signup or lazily on first relevant action is an implementation detail, either way, an account with no relevant activity ever simply sits at 50 with drift correctly computing to a no-op.
- Lazy drift computation is correct across multiple elapsed weeks in a single read (an account unchecked for 3 weeks catches up all 3 steps of drift at once, not just 1), and correctly stops at 50 rather than overshooting.
- The "clean first week" behavior is proven by a test that lets a full week of drift elapse before a repeat -5-class infraction, confirmed to land above 0, contrasted with the same infraction landing at or below 0 when it happens immediately after restoration.
- ESS lock correctly sets both `ve_status` and `lnc_status` false regardless of which was held, and restoration correctly rejects a fresh `TokenGrant` from the same `granting_account_id` as the original.
- DSS lock blocks seed creation and publish on the Seed Editor branch, tested against an account that would otherwise be well within its quota — the DSS check must be shown to block independently of quota standing, not just alongside it.
- `StandingScoreEvent` entries from a moderator action always carry both `moderator_account_id` and a non-empty `explanation`; entries from a system-triggered lock do not require either.
- Existing Seed Editor tests still pass after the retrofit; migration is additive with zero drift.
- Filing a `SeedReport` correctly surfaces to Moderators, and resolving it via `SeedRevision` correctly applies the corresponding CSS adjustment to the reporter and, if severity-classified, the corresponding DSS tier to the seed's architect. A report counts toward the same combined daily cap as comment/module reports.

---

## Open items carried forward

- **Resolved:** "Seed rejected on human review" (DSS) is proposed to route through the new seed-report mechanism (Task 5), with severity tiers applied to the architect at moderator discretion. This is a proposed synthesis connecting two previously separate threads, not a confirmed design — flag if a different mechanism was intended.
- **Resolved:** a confirmed `ve_conduct_review` `AccountFlag` triggers ESS lock directly, restoration is identical regardless of lock cause.
- **Resolved:** all three scores apply to every account simultaneously and independently — no transition or mutual exclusion between CSS and Developer/VE/LNC status.
- **New open item:** exact CSS point values for the seed-report trigger (+5/-2, mirroring the comment tier) are proposed, not confirmed. Reasonable given seed vandalism's severity is closer to a bad comment than a bad module, but not explicitly stated anywhere.
- **DSS's endorsement-driven payouts, CSS's report-outcome triggers for comments and modules, and ESS's post-publication rejection/10-recommendation triggers all remain unwired** until Module Editor and Library exist. The schema and historical-record mechanism are ready for them; nothing fires yet.
