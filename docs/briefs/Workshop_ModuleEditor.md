# Legible Novelty — Workshop: Module Editor

**Task brief for Claude Code.** Second of Workshop's three sub-stages. Depends on the Seed Editor sub-stage existing (a Module requires a primary Seed to reference).

**Task 7 was blocked pending definition of the slide-based authoring model; it's now resolved.** Lightweight PowerPoint-like: a positioned-element model on a sequence of pages, templates available as a convenient starting point, free positioning always available beneath that. No interactive/executable widget functionality (crosswords, puzzles) yet — deliberately deferred, see Scope — but the element-type system is built extensibly so those can be added later without restructuring.

---

## Scope

**In scope:**
- Contextualized Module schema (Sections 5.2–5.3)
- Module Lifecycle and Version Control (Sections 5.4–5.5)
- The two deterministic hard-error publication checks: commission alignment and seed alignment (Section 8.3)
- Report-driven takedown and moderator takedown authority (Section 10.4), integrated with the Standing Scores system (DSS/CSS consequences, mirroring `SeedReport`) and the DSS authoring-lock check (extended from Seed Editor to also cover module authoring)
- Content Charter, political-systems escalation tier, functional test, comparison rule, and appeal process (`LN_Content_Governance_Policy_v1.md`, Sections 3-8) — the actual standard a Moderator applies during report review
- The under-18 endorsement visibility gate's backend support
- Module authoring UI: page/element schema, templates, free positioning, fillable fields nested within text elements

**Explicitly deferred:**
- Interactive/dynamic elements — crosswords, other puzzles, anything ActiveX-like. The element-type system is built to accommodate these as new types later; none are built now.
- DEF Arbitration itself (Sections 8.1–8.2, 8.4–8.6) — Phase 2, compute-dependent. Reserve a nullable text column for the eventual report.
- The escalation panel's actual staffing and recruitment — the governance policy document marks this "pending Phase 1 staffing decision" itself; this brief builds the schema, not the staffing.
- Endorsement and Community Recommendation, ranking, sort, filters, homepage list, quick search (Section 9) — Library's job. This sub-stage exposes the fields and FK targets Library needs, builds none of the consuming logic.
- Quiz/Test/Scoring, Progress Archive, Printable/Downloadable Format (Sections 7.3–7.5) — Library's, per that section's own header split.
- Flair tags' upload/template UI — schema field only, per the design doc's own groundwork-only instruction.

---

## Tasks

### 1. Contextualized Module schema

| Field | Type | Notes |
|---|---|---|
| `module_id` | UUID/PK | |
| `author_account_id` | UUID/FK | |
| `primary_seed_id` | UUID/FK | Exactly one, mandatory — this is what educator endorsement actually vouches for |
| `primary_seed_revision_id` | UUID/FK → SeedRevision | Pinned at creation, permanent (Task 3). Was loosely specified as a bare version string before Seeds got real Wikipedia-style revision tracking (Seed Editor, added post-merge) — now a real reference to the exact archived content the module was built against, not just a number. |
| `secondary_seed_ids` | array of UUID/FK, max 3 | Locked at submission to Pending Review — no add/remove/swap after that point. **Same revision-pinning applies here too** — each secondary seed reference should pin to a `SeedRevision`, not just the live seed, for the same reason the primary seed does: a citation should stay stable even if the secondary seed is later edited. This wasn't explicitly restated when the versioning requirement was added, but the reasoning is identical, flagging as an inference rather than a silent assumption. |
| `prerequisite_followon_refs` | derived | Inherited from primary seed's chain relationships, not separately authored |
| `lesson_size_scope` | inherited from primary seed | |
| `version` | integer | Increments on publish, not on autosave (Task 3) |
| `publication_date` | timestamp | |
| `ai_attestation` | enum: wholly_human / ai_assisted_manual_flair / ai_pipeline | Author-declared at submission; Library's ranking logic consumes it, this sub-stage just captures and locks it correctly |
| `associated_commission_id` | UUID/FK, nullable | Soft reference — Commission Marketplace isn't built in this sub-stage either |
| `commission_snapshot_text` | text, nullable | Frozen at time of association or publication — never updates after |
| `prepublication_review_report` | text, nullable | Placeholder column for Section 8's eventual DEF/Justice report |
| `flair_tags` | array, nullable | Groundwork only, no upload/template UI |
| `status` | enum: draft / pending_review / moderation_hold / published | See Task 2 |

**Secondary seed rules:** proposed until independently endorsed (Library's job), no bounded rigor requirement, exist for genuinely parallel relevance only — a true sequential dependency belongs in prerequisite/follow-on metadata, not here. An unendorsed secondary seed tag carries no ranking or filter advantage, which is what actually blocks the tag-gaming abuse vector; the 3-item cap only bounds review-queue noise.

### 2. Module Lifecycle and Version Control

```
Draft → Pending Review → [Moderation Hold] → Published
```

No automated Archived state. Archiving, where it happens, is manual, initiated by the author or a System_Admin.

- **Moderation Hold** is optional and re-entrant. While in this state, only Moderators can search for or view the module. Trigger conditions: Moderator discretion at any time, or the report-escalation system (Task 4).
- **Version increment** on any author edit to a published module, or any author-implemented edit made in response to a comment. "Version" means a distinct published release, not every autosave.
- **Endorsement/recommendation counts persist across versions** (current-version count in white, sum of prior-version counts in light grey prefixed "+", sorting always uses the combined total). The counting logic is Library's; this sub-stage's version history needs to expose exactly this split cleanly.
- **Edit scope:** everything editable post-publication except: the seed reference can change but re-triggers Task 3's seed-alignment check; commission association can change either direction; AI attestation locks permanently once it is set to AI Pipeline; the commission snapshot freezes at original publication regardless of later edits to anything else.
- **Seed versioning:** modules stay permanently tied to the specific `SeedRevision` they were built against (Task 1), via `primary_seed_revision_id`. Editing a seed after publication (Wikipedia-style revision tracking, added to the Seed Editor after its initial merge) creates a new revision but never retroactively affects any existing module built against a prior one — the module's citation stays exactly what it was when the author built against it.
- **"Edited under you" warning:** edits before the current version's first endorsement/recommendation are unflagged. Once the current version has at least one, any edit within the past hour triggers a warning to the next endorser/recommender, including a line-count delta. The triggering action is Library's; this sub-stage tracks the edit timestamps and produces the delta.

### 3. Publication gate — deterministic checks only (Section 8.3)

**Two hard-error checks, both deterministic rule comparisons against structured data, no DEF/AI machinery:**

- **Commission alignment:** if a commission is attached, module content is checked against the commission's description; throws a specific, actionable error on mismatch.
- **Seed alignment:** if the seed reference was changed on an existing module, throws an error if content doesn't satisfy the new seed's constraints.

Both block publication. **Nothing else gates first-time publication.** Once these two checks pass, the module publishes immediately — no additional mandatory human review step, per the resolved pilot-study-era posture (see the combined Workshop discussion this brief was split from). Everything else in Section 8 is Phase 2.

### 4. Report-driven takedown, moderator authority, and Standing Score integration (Section 10.4)

- **1 report** on content with no prior moderator review → Moderation Hold queue.
- **2 reports from different users** on content with no prior moderator review → automatic takedown, pending moderator review.
- **Once a moderator reviews and clears a specific version, automatic takedown is permanently disarmed for that version.** Further reports route to the queue only, flagged "previously reviewed."
- **Publishing a new version re-arms the trigger fresh.**
- **A Moderator's manual takedown authority is absolute and independent of automated state at any time**, requiring a brief rationale logged for accountability.

**Standing Score integration — this was explicitly left unwired in the Standing Scores brief pending this sub-stage, wire it now.** Mirror the `SeedReport` pattern from that system exactly, don't invent a parallel mechanism:
- Filing a report against a module counts toward the shared 3-per-day cap (comments, modules, and seeds combined), same calendar-day-at-midnight-Pacific reset already established.
- When a Moderator resolves a report by rejecting the module, apply CSS +10 to the reporter (Section 10.5); if the report is deemed unfounded and the module is retained, apply CSS -5 to the reporter instead.
- Rejection is severity-classified by the Moderator (insufficiency/inappropriate/egregious), applying the corresponding DSS tier (0/-10/-20, Section 10.4 of the governance policy) to the module's `author_account_id`. Same three-tier structure already used for `SeedReport`.
- **Before allowing any module creation, edit, or publish action, check the author's DSS latch state** (`locked_at is not null`) — this is the same check retrofitted into Seed Editor, extended here since DSS's lock explicitly covers "seed and module authoring" both. Don't build a second, module-specific version of this check; call the same underlying function Seed Editor already uses.
- Every moderator retain/reject decision creates a `StandingScoreEvent` with `moderator_account_id` and a required `explanation` — same accountability pattern as everything else in that system.

### 5. Content governance: charter, escalation tier, and appeal process

**New in this pass — a full policy layer for what a Moderator actually applies during Task 4's review, not previously in this brief.** Source: `LN_Content_Governance_Policy_v1.md`, Sections 3-8. This gives Task 4's "reject" decision an actual published standard to cite instead of pure discretion.

**Content Charter (Section 3):** in scope is academic content aligned with the module's Learning Seed objective, including the structure, history, and mechanics of systems (government and political systems included), sourced to mainstream scholarship and historical record, consistent with the autism-affirming framing. Out of scope: content unrelated to the seeded objective regardless of source; uncritical presentation of a system's self-description as neutral fact; recruitment-style framing of any political, religious, or ideological position; content contradicting the autism-affirming core. **A rejection must cite the specific charter clause violated — a reviewer's personal opinion of the author or the position described is never a valid basis.**

**Escalation tier (Section 4):** any module whose primary or secondary seed is placed under a government-or-political-systems Topic (reusing Seed Editor's existing Taxonomy, not a separate module-level tag — this is an inference, flag if a standalone tag was actually intended) routes to a second review tier beyond the standard checks above. Escalation triggers purely on topic placement, never on a reviewer's suspicion of a specific VE or author.

**Functional test for the escalation tier (Section 5):** descriptive mode (explaining a system's structure, history, and documented consequences, situated against its own stated goals, costs, and historical record) is in scope, applied identically regardless of whether the reviewer finds the system admirable or abhorrent. Advocacy mode (presenting a system's own claims as settled fact, omitting documented failure modes, using recruitment-style framing) is out of scope. System-agnostic — the same test applies to every named system without exception.

**Cherry-picked comparison rule (Section 6):** a comparison between systems must hold same categories (every evaluative category applied to one system applies to all), same register (theory vs. theory, practice vs. practice, never theory vs. the other's practice), and same representativeness (typical form, not an atypical best or worst case) — or state explicitly why it can't. Failing any of the three fails the comparison regardless of which system the imbalance favors.

**Schema — this needs real structure, not just a free-text rationale field:**

| Table | Field | Notes |
|---|---|---|
| `ModuleReviewDecision` | `decision_id` (PK), `module_id` (FK), `moderator_account_id` (FK), `decision` (enum: retain/reject), `cited_clause` (enum: charter / functional_test / comparison_rule, nullable if retained), `section_reference` (text, nullable — the specific module section identified), `rationale` (text), `created_at` | The detailed content-review record. Feeds a `StandingScoreEvent` (Task 4) for the resulting CSS/DSS consequence, but this table carries the structured citation Section 7's appeal process actually requires; `StandingScoreEvent.explanation` alone isn't structured enough for this. |
| `ModuleReviewAppeal` | `appeal_id` (PK), `module_id` (FK), `original_decision_id` (FK), `status` (enum: pending/resolved), `panel_reviewer_ids` (array of FK, 3 or more), `panel_rationale` (text), `resolved_at` | Section 7: disputed rejections escalate to a panel of three or more reviewers spanning varied backgrounds, not limited to credentialed VEs. Reviewer identity may stay confidential in any public-facing display later (Library's concern); the reasoning itself is never confidential and must be retained. |

**Appeal process (Section 7):** a rejected module's author receives written rationale citing the specific charter clause, functional test criterion, or comparison rule violated, with the module section identified, and may revise and resubmit against that specific criterion. A disputed rejection can escalate to the panel above.

**Reviewer checklist (Section 8)** — a process aid for the Moderator during review, not itself a hard schema gate: content aligns with the seed's objective; sourced to mainstream scholarship; no recruitment-style framing; systems presented comparatively, not in isolation as neutral default; same categories/register/representativeness across any comparison; rejection (if any) cites a specific clause or criterion, not personal assessment.

**Not built here:** the escalation panel's actual staffing and recruitment — the governance document itself marks this "pending Phase 1 staffing decision" (its own Section 9), and this brief doesn't resolve it either.

### 6. Under-18 endorsement visibility gate — backend support only

**Corrected — the previous VE/LNC-based version of this task was wrong, not just narrow.** Gating on VE/LNC status rather than age meant ordinary adult Community Members, the bulk of the population actually capable of reporting bad content, couldn't see unendorsed modules either. That defeats the reason this gate exists in the first place: letting non-VE users discover and report problematic unendorsed content without requiring a Verified Educator to personally review every single module. A community-reporting safety net (Task 4) that's invisible to the community it depends on isn't a safety net.

**The actual rule is age-based, not status-based:** any account under 18 (this covers both `is_child_subaccount = true` and the 13-17 graduated-minor population — a single check against date of birth, not two separate flags) cannot access a module whose primary seed has zero endorsements, under any circumstance. **Adult accounts (18+) can see an unendorsed module if they specifically search for it.** VE/LNC status is not a factor in this gate at all — an ordinary adult Community Member with no special status can find and report unendorsed content; that's the point.

**Reuse the existing 18+ check, don't reinvent it.** Stage 1's Share Contact Information feature already gates on `date_of_birth` indicating 18 or older. Whatever that check does, this gate should call the same logic, not a second parallel age calculation.

**Open question this brief doesn't resolve, for Library to decide:** "if they search for it" implies search-reachable but not necessarily surfaced through passive discovery, browse listings, recommendations, homepage. Whether unendorsed content should also appear in those passive surfaces for adults, or only in active search, isn't stated here — don't assume either way. This sub-stage's obligation doesn't change either way: `primary_seed_id` as a clean, stable FK target Library's Endorsement table can join against efficiently, so whichever visibility rule Library implements, the underlying check is cheap.

Document this prominently for whoever builds Library — it's the specific mitigation for the residual risk Section 10.3 names, not optional.

### 7. Module authoring UI — page, element, and template model

**A module is an ordered sequence of pages.** Each page holds one or more positioned elements — lightweight PowerPoint, not full PowerPoint: no animations, no transitions, no embedded video/audio unless that's confirmed as wanted later (not assumed here).

**Templates are a starting-point convenience, not a separate locked mode.** Picking a template pre-populates a page's elements at preset positions; nothing prevents moving them afterward. Free positioning is always available underneath, not gated behind an "advanced mode" toggle — there's one underlying model (positioned elements on a page), and a template is just a fast way to prefill it. This is an inference from how the requirement was phrased ("templates as needed," "advanced use will allow moving elements"), not a directly confirmed structure — flag back if two genuinely separate modes were actually intended.

**Schema:**

| Table | Field | Notes |
|---|---|---|
| `ModulePage` | `page_id` (PK), `module_id` (FK), `page_order` (integer), `template_id` (FK, nullable) | `template_id` records which template a page started from, if any — informational, doesn't constrain later edits |
| `ModuleTemplate` | `template_id` (PK), `name`, `description`, `element_layout` (JSON) | Pre-arranged element positions/types/placeholder content, instantiated into real `ModuleElement` rows when picked. **Open question:** admin-authored only, or can module authors save their own templates for reuse? Not specified — build admin-authored-only for now, flag it as the narrower default, not a confirmed limitation. |
| `ModuleElement` | `element_id` (PK), `page_id` (FK), `element_type` (enum: text / image / fillable_field), `position_x`, `position_y`, `width`, `height`, `z_index`, `content` (JSON, shape depends on `element_type`) | The type-discriminator-plus-flexible-content pattern here is deliberate, same as `AccountFlag.flag_type` and `AwardInstance.target_id` elsewhere in this project — adding `crossword` or `puzzle` as a new `element_type` later shouldn't require restructuring this table, just a new type value and its own `content` shape. |

**Fillable fields nest inside text elements, they aren't their own top-level type.** Section 7.2's mechanism is unchanged: a `text` element's `content` is TipTap-edited rich content, and fillable fields are custom TipTap node types within that content, each with a unique identifier via `@tiptap/extension-unique-id` (confirmed free/MIT). What's new is that a text element is now one positioned block on a page rather than the entire module being one continuous document.

**Explicitly not built here:** any interactive/executable element type (crossword, puzzle, or similar). The `element_type` enum and `content` JSON pattern are shaped to make adding these later straightforward, but nothing beyond `text` / `image` / `fillable_field` exists in this sub-stage.

**Open questions this task doesn't resolve, flagging rather than guessing:**
- Is there a maximum page count per module, or any constraint at all? Not specified.
- Can module authors create and save their own reusable templates, or is template creation admin-only? Built admin-only here as the narrower, safer default — confirm if author-created templates were actually intended.

---

## Acceptance criteria

- `schema.prisma` includes a complete, real `ContextualizedModule` model — no placeholders.
- The two Section 8.3 hard-error checks actually block on a genuine mismatch and do not block on a genuine match.
- Report-driven takedown thresholds fire correctly, the permanently-disarmed-after-review state holds across subsequent reports on the same version, and re-arms correctly on a new version.
- A moderator's retain/reject decision on a reported module correctly creates both a `ModuleReviewDecision` (with structured clause citation) and a `StandingScoreEvent`, applying the correct CSS adjustment to the reporter and, on rejection, the correct DSS tier to the module's author — mirroring `SeedReport`'s pattern exactly.
- A DSS-latched author is blocked from module creation, edit, and publish, using the same underlying check Seed Editor already uses, not a second parallel implementation.
- A module placed under a government-or-political-systems Topic (via its seed's Taxonomy placement) correctly routes to the escalation tier; a module under any other Topic does not.
- A `ModuleReviewAppeal` correctly references its originating `ModuleReviewDecision` and requires at least 3 distinct `panel_reviewer_ids`.
- A query for "does this module's primary seed have at least one endorsement" runs efficiently, verified via a stubbed endorsement reference since Library's real Endorsement table doesn't exist yet. Test against a single age-based check (under 18, reusing Stage 1's existing 18+ logic), not VE/LNC status — an ordinary adult Community Member with no special status must be able to access unendorsed content, and a 13-17 graduated-minor account must not.
- `flair_tags` and `prepublication_review_report` exist as schema columns, provably unused by any built feature.
- Picking a template correctly instantiates real `ModuleElement` rows at the template's preset positions; moving an element afterward isn't blocked by having come from a template.
- A module's pages, elements, and their positions round-trip correctly through create/read/update.
- A fillable field embedded in a text element's content carries a unique identifier and is queryable independently of the rest of that element's content.

---

## Open items carried forward

- **Whether unendorsed content is search-reachable only, or also surfaced through passive discovery (browse, recommendations, homepage) for adult accounts,** is unresolved — Library's call to make, not assumed here either way.
- **Whether module authors can create their own reusable templates, or template creation is admin-only,** is unresolved — built admin-only as the narrower default. Confirm before assuming that's final.
- **Whether there's a maximum page count per module** is unresolved — no limit built in the absence of one being specified.
- **The publish-immediately posture (Task 3) is explicitly tied to the pilot study's small, known user base** and should be revisited before any wider public launch, not treated as a permanent default. Task 6's gate protects minors specifically; adults can find unendorsed content via search by design, so this doesn't reduce adult-facing risk the way the earlier (incorrect) VE/LNC-based version would have — the pilot-context caveat still carries the real weight here.
- **Escalation-tier routing (Task 5) is inferred to reuse Seed Editor's existing Taxonomy placement, not a standalone module-level tag.** Not explicitly confirmed — flag if a separate tag was actually intended.
- **VE endorsement's public-facing display — whether it should be scoped and revocable per module version, distinct from platform-wide VE status — is marked "pending design decision" in the governance policy itself (its own Section 9).** Directly relevant to Task 2's endorsement-count-persists-across-versions design; not resolved here either.
- **Unrelated cleanup, tracked here per instruction rather than in the Standing Scores brief it actually belongs to:** `canRestoreEss` was dead code following the restore-then-grant reordering and has been deleted. It was never a required-different-VE check — the intent was always permissive: a recipient re-confers VE via a fresh peer-token grant from any VE with an available token, not specifically their original granter. Nothing to wire in.
