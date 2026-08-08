# The Legible Novelty Library & Workshop — Design Document (v0.13)

This document was restructured from a chronological decision log into a system-organized reference (v8), then reorganized again here (v0.13) by high-level subsystem rather than by build-order topic (Section 22's system map). Original section and subsection numbers are preserved exactly as they were, unchanged, specifically so every existing cross-reference in this document (e.g., "Section 9.4," "Section 21.2") remains correct without needing to be rewritten — only the physical grouping and heading level have changed, not the numbering. Two sections (4 and 7) split across two Parts; each half carries a note pointing to where its other half lives.

Status: all major systems are resolved at the design level. The remaining work is the frontend/UI system map (a build-phase inventory exercise) and whatever new questions surface once implementation begins.

**Naming.** The platform's public-facing brand is split in two, and this document's Part I / Part II split follows the same line. **The Legible Novelty Library** (Part I) is the unconditionally-public reading experience: modules, Big Questions archive, no account required (Design Principle 1). **Legible Novelty Workshop** (Part II) is the account-gated, contributor-facing side: the authoring workflow, the commission marketplace, and the Seed Architect / Module Author roles. Content within each Part continues to refer to "the platform" generically where a system spans both sides; the two-name split is a presentation-layer distinction, not a change to the underlying architecture.

---

## Table of Contents

**Part I — Library**
- 9. Search, Ranking, and Endorsement
- 7. The Authoring Workflow *(reader-facing half: 7.3–7.5)*
- 15. PDF Generation and Pseudonymity
- 12.1 Lesson Plans

**Part II — Workshop**
- 5. Seeds and Modules
- 6. Seed Taxonomy and Chaining
- 7. The Authoring Workflow *(authoring half: 7.1–7.2)*
- 10. Quality Control and Moderation
- 13. Commission Marketplace

**Part III — Certification Center**
- 4. Verified Educator Status *(LNC/onboarding half: 4.3–4.4)*

**Part IV — User Management**
- 2. Roles, Account Characteristics, and Identity
- 3. Account Lifecycle: Minors, Parents, and Purge
- 4. Verified Educator Status *(verification/accountability half: 4.1–4.2)*
- 12.2–12.3 Connections, Share Contact Information
- 14. Awards System
- 21. Account Status Badges (VE / LNC / FotL)

**Part V — Communication**
- 11. Comments, Big Questions, and the Forum
- 20. Community Channels: Subreddit and Central Forum

**Part VI — Notification**
- 16. Email and Notifications

**Part VII — Infrastructure**
- 17. Infrastructure and Stack
- 8. Pre-Publication Review

**Part VIII — Payments and Billing**
- 23. Payments and Billing

**Other**
- 1. Design Principles
- 18. Planned Features (Deferred from v1)
- 19. Cross-References to Book Manuscript
- 22. High-Level System Map (Subsystem Assignment)

---

## Part I — Library

### 9. Search, Ranking, and Endorsement

#### 9.1 Endorsement (per-seed, not per-module)

- Only Verified Educators may endorse. **Correction (matches Section 22's characterization):** endorsement eligibility is **VE _or_ LNC**, not VE-only — Section 22's summary of this section says "for Endorsement, VE/LNC status specifically," and an LNC-certified account holds the same functional endorsement ability without Verified Educator status (Section 4.3). The permission check is `ve_status = true OR lnc_status = true`. (`lnc_status` has no source until Certification Center ships, so the LNC path is currently unreachable but implemented.)
- Endorsement is a binary toggle: clicking again removes it.
- Endorsement applies per seed-tag, not per module. A module's primary seed and each secondary seed each carry their own independent endorsement state.
- A secondary seed is "proposed" until independently endorsed, at which point it behaves identically to an endorsed primary seed for search purposes.
- **General endorsement pool, no scope limits.** Any Verified Educator may endorse any seed or module, regardless of their own grade-level or subject background. Scope-limiting endorsement ability to an educator's apparent expertise range was explicitly considered and rejected: Verified Educator status already implies professional judgment, a profile's stated grade range may not reflect an educator's actual knowledge range, and special educators in particular often work meaningfully across levels by the nature of the role. The mitigation instead is informational: the endorsing educator's credential context (subject, grade range) displays alongside their endorsement, letting users weigh the signal themselves rather than the platform pre-filtering it.
- **No endorsements are required to publish.** Zero-endorsement content is fully accessible and flagged as "not yet endorsed," sorting below endorsed content by default (Section 9.3) but never hidden. **Correction (later-added exception):** the "never hidden" wording predates Module Editor's under-18 visibility gate (added to address the residual risk in Section 10.3). For **under-18 accounts specifically**, a module whose primary seed has zero endorsements is not visible; adults (18+) can still reach it via search. The first endorsement on a module's primary seed promotes it to full passive-discovery visibility for all ages ("the public section"). So "never hidden" holds for adults; for minors it is narrowed to endorsed content.
- **Endorsement is additive only.** Verified Educators cannot reject or downvote a seed or module — the only rejection path for published content is moderation (Section 10.4).

#### 9.2 Community Recommendation (module-level)

- Global to the module as a whole, not per-seed.
- Binary toggle, same click-again-to-remove behavior as endorsement.
- Requires an account meeting the eligibility gate (Section 9.5).
- No downvote mechanism.

#### 9.3 Sort Modes

| Sort | Formula |
|---|---|
| **Weighted Approval** (default) | (endorsements × 3 + recommendations) × AI attestation multiplier |
| Unweighted Approval | endorsements × 3 + recommendations |
| Weighted Usage | (downloads + completions with passing grade) × AI attestation multiplier |
| Unweighted Usage | downloads + completions with passing grade |
| Recency | publication date, newest first, no score calculation |

All sort modes carry an arrow toggle for inversion (↑↓) — inversion is a toggle on the active sort, not a separate menu entry. Default sort is Weighted Approval; within the broader approval/usage choice, the platform defaults to approval over usage, reflecting that educator and community judgment is the primary trust signal and usage is secondary.

**Tracked signals** (stored on the module record): educator endorsement count (per seed), community recommendation count, total downloads, total completions with a passing grade. Completions with a passing grade is treated as the strongest usage signal, since it represents a real learner finishing and demonstrating understanding, distinct from downloads which may reflect curiosity alone.

#### 9.4 AI Attestation and Ranking Multiplier

At submission, a Module Author must declare the generation profile used to produce the module before the system accepts it. **Two options are available for author declaration:**

- **Wholly Human-Crafted**: no generative AI text, layout, or structural output was used.
- **AI-Assisted with Manual Flair**: core text or structure was produced or adapted using AI tools (the author's own, external to the platform — Section 7.2), but the author manually edited the output or engineered significant portions of the layout.

| Declaration | Multiplier |
|---|---|
| Wholly Human-Crafted | 10× |
| AI-Assisted with Manual Flair | 2× |

A third tier, **AI Pipeline** (1× multiplier), covers modules produced by an automated pipeline; the ratios above are designed to extend cleanly to this third, lower tier without renumbering the multiplier scheme.

A Wholly Human-Crafted module with 9 endorsements ranks above an AI-Assisted module with 44 endorsements (90 vs. 88 weighted score). This does not prohibit or absolutely disadvantage AI-assisted content; it equalizes the playing field against the physics of automated output volume.

The multiplier applies only to the weighted sort formulas (Section 9.3); it has no effect on Unweighted sorts or on the raw recommendation count.

**Attestation as a filter, not a baseline-score adjustment.** A baseline score boost for new Wholly Human-Crafted modules (to differentiate them from new AI-Assisted modules before any endorsements accumulate) was considered and explicitly rejected, in favor of treating attestation tier purely as a filter. A user who specifically wants to discover new human-authored content sets the attestation filter accordingly and sorts by Recency — filters and sorts do different jobs and should not be conflated. New modules of any attestation tier start at zero on the weighted approval/usage formulas and earn rank through genuine signal.

#### 9.5 Filters

- Interest domain / special interest tag
- Grade level
- Subject area / curriculum alignment (Section 6)
- Language
- Endorsement status — binary: at least one educator endorsement (yes) or none (no); no count threshold at the filter level
- AI attestation tier — Wholly Human-Crafted / AI-Assisted with Manual Flair / all (a third tier, AI Pipeline, covers automated-pipeline modules — Section 9.4)

**Eligibility gate (anti-bot), applies to recommendations, public module comments (Section 11.2), and the commission support button (Section 13):** an account must be at least 7 days old and have a completed profile. New accounts attempting a gated action before eligibility see an encouraging message directing them toward exploring modules during their first week, framed as onboarding guidance rather than rejection.

**Cookie-stored search/filter state:** a functional session cookie storing last search terms and active filters, with no personal data and no cross-site behavior — exempt from most consent requirements, and gives anonymous visitors a persistent browsing experience without requiring an account.

**Planned feature:** named filter presets (e.g., a one-click "Endorsed + Weighted Approval" state). Deferred to the UI build phase (Section 18).

#### 9.6 Homepage Module List (Unauthenticated Landing)

The unauthenticated homepage displays up to 20 modules as a bounded, non-paginated "window shopping" list — not a general browse feed. A visitor wanting more uses search (Section 9.7) or the full browse view; this list's job is a finite first taste of the library, not ongoing discovery.

**Eligibility, a tiered cascading window:** modules are eligible if their most recent endorsement or recommendation falls within the last 2 weeks. If fewer than 20 modules qualify, the window widens to 2 months, then to no window at all (anytime) if still short. This is a recency *eligibility filter* only — it does not change how eligible modules are scored.

**Ranking within the eligible pool:** standard Weighted Approval (Section 9.3: endorsements × 3 + recommendations), with the AI attestation multiplier applied (Section 9.4) exactly as it is everywhere else the formula is used. The homepage list is not a separately-computed metric; it's the existing ranking system with a time-boxed eligibility gate in front of it.

**"Up to 20," not exactly 20.** If even the widest (anytime) pool has fewer than 20 qualifying modules, the list simply shows however many exist — including zero. This is expected to be common in the platform's earliest weeks and is not treated as an error state.

**Empty state:** a single static text message, "Make sure to recommend your favorite modules!" — shown identically whether the cause is zero qualifying modules or a search/load failure. No conditional logic, no account-status branching, deliberately kept simple; the tradeoff is that a genuine technical failure and an empty result are visually indistinguishable to the visitor.

**Open question, not yet resolved:** whether the homepage list should cap how many consecutive modules from the same Subject or Context can appear, to avoid one heavily-endorsed domain (e.g., a week where Math dominates) crowding out the rest of the library on the single highest-visibility page a new visitor sees. Left as an explicit open decision rather than defaulted either way.

**Not a general sort mode.** This cascading-window mechanic is homepage-only and does not appear as a selectable "Trending" option in the general browse view; the existing sort modes (Section 9.3) are unaffected by it.

#### 9.7 Quick Search (Slide-Out Panel)

Search is presented via a slide-out panel rather than a modal, specifically because a slide-out keeps the underlying page visible rather than fully dimming and blocking it behind a hard context switch — a lighter interruption, consistent with the platform's general preference for predictable, non-jarring interaction patterns (see, for example, the badge tooltip dismissal design, Section 21.4).

**Open question, not yet resolved:** whether the main search text input itself remains directly visible and typeable on the page at all times, with only the filter controls living in the slide-out, or whether the entire search UI, text input included, lives inside the panel. The first gives a true zero-click "start typing immediately" entry point; the second is a gentler interruption than a modal but still costs one click before typing starts.

**Fields, in the slide-out panel:**

- **Language** — dropdown, defaults from an IP-based lookup. The lookup is used only to set the default value and must not be logged or retained anywhere, consistent with the platform's data-minimization principle (Section 1) and the existing filter-state cookie's minimal-retention precedent (Section 9.5).
- **Subject** — dropdown (Section 6.1's existing taxonomy).
- **Topic** — dropdown, populates based on the selected Subject (cascading, reusing the existing Subject → Topic taxonomy structure directly).
- **Context (special interest)** — an ARIA listbox widget (not a dropdown): 5-8 visible items with a scroll region, alphabetically ordered (stability over popularity-based ordering, so the list doesn't reorder itself as content grows), with standard listbox type-ahead behavior (typing a letter jumps to or filters matching entries). **Multi-select.** Selections within Context combine via OR (any selected interest qualifies a module); Context as a whole combines with Language/Subject/Topic via AND. This combination rule is identical on the advanced full-page search (Section 9.5). Each module carries exactly one Context tag, so the OR condition is a single-field `IN (selected values)` check, not a multi-tag join.
  - **Open question, not yet resolved:** what specifically closes or collapses the listbox, given it's deliberately specified not to auto-collapse on blur the way a dropdown would. An explicit collapse control, or does it simply stay open for as long as the enclosing slide-out panel is open?
- **Advanced** — a link routing to the full-page search (Section 9.5's complete filter set: grade, endorsement status, AI attestation tier, etc.), for anyone who needs the fuller filter set the quick panel deliberately doesn't surface.

**"Use my interests" button.** A separate, explicit text button, not automatic pre-filling — deliberately opt-in rather than a silent default, to avoid quietly narrowing what a returning user sees without their noticing (the filter-bubble problem). On click, replaces (not adds to) whatever is currently selected in the Context listbox with the interests listed on the user's profile.

- **Guests:** button renders disabled/greyed out at page load — this is free information already known at load time, no extra query needed.
- **Logged-in users:** button always renders active (no profile pre-check at page load, to avoid an extra query on every page load regardless of whether it'll be used). The profile's interest list is fetched only at click time. If interests are found, the listbox populates as designed. If the profile has no interests set, an inline message appears ("no interests set on your profile yet"), rather than the button silently doing nothing.
  - **Open question, not yet resolved:** whether a brief loading indicator appears between the click and the result, or whether the fetch is assumed fast enough not to need one.

---

---

### 7. The Authoring Workflow *(split — 7.1/7.2 are in Part II: Workshop)*

#### 7.3 Printable / Downloadable Format

Modules are designed to be printable from the start — this is a deliberate scope constraint on what content types the editor needs to support. No video, no interactive diagrams, no carousels. Images import and print cleanly; fillable fields render as blank lines or boxes in print.

**Print/download mechanism:** a browser print stylesheet, not server-generated PDF infrastructure — viable specifically because the printability constraint means the web viewer and the print output are the same document in two presentations, not two documents to maintain separately.

**Three-section print layout:**
1. Main module content — fillable fields as blank lines/boxes, questions without answers
2. Answer key — correct answers, clean and brief
3. Student advice — per-question advice on wrong answers, printed on a separate page

The advice section is authored entirely for the student who got an answer wrong and wants to understand why — module authors do not write a separate teacher-facing version. That the same content is useful to a teacher holding the printed pages as a discussion reference is a secondary benefit of the print layout, not a separate authoring target. **Planned feature:** an optional "notes for educators" field per question, appearing only in print and never in the web viewer, deferred to a later version (Section 18).

**Footer on all printed pages:** module name, creator(s), revision number, revision date.

#### 7.4 Quiz, Test, and Scoring Mechanics

**Unassigned access:** scoring is entirely client-side and ephemeral. Nothing is collected or stored. This is the default for any learner who finds a module independently, anonymous or logged-in, and is consistent with the unconditional public reading principle (Section 1).

**Assigned access (via lesson plan, Section 12):** after completing an assigned module, a logged-in learner with a verified grade/age is prompted to submit their results to the account that assigned it. The prompt only appears for logged-in, verified accounts — an anonymous learner completing an assigned module sees their score client-side only, with no submission prompt, since submission to a third party from an unverified or unidentified minor would create the exact COPPA/FERPA exposure the account architecture (Section 3) is designed to avoid. The student initiates the share; the platform never routes a learner's data to a teacher independently.

**Per-question advice:** authored at module creation time, displayed client-side on a wrong answer, no server round-trip required.

#### 7.5 Progress Archive

Every logged-in user has a personal progress archive, structurally separate from the module itself — progress belongs to the account, not to the module. Stored as a structured text file (JSON or similarly lightweight) attached to the user's account, containing fillable-field state, partial quiz/test answers, scores, and completion status per module. Device-agnostic: it travels with the account on login, with no sync-conflict logic needed since it's a single file per account rather than per-device state.

- Reset clears the user's progress record for a specific module only.
- Purged with account purge (Section 3.5).
- Carries forward intact at child-account graduation (Section 3.3).
- A parent cannot reset a child's progress archive — the child controls their own record.
- The viewer must be able to parse the file to restore field state on load; structure (not raw unstructured text) is required for this to work without custom per-field parsing logic.

---

---

### 15. PDF Generation and Pseudonymity

(See Section 2.3 for the pseudonymity/display-name toggle that this section's "dynamically pulled" fields depend on.)

The downloadable artifact for a Contextualized Module is a PDF, with the cover page generated **dynamically at each download** rather than fixed at publish time — ensuring the cover always reflects current account settings (display name choice) rather than a stale snapshot from whenever the module was last built.

#### 15.1 Title Page Field List (Final)

1. Image selected by the Module Author.
2. Module title, with module version number and module publication date.
3. Module Author name — dynamically pulled current display-name setting (pseudonym or legal name, per Section 2.3), not a static snapshot.
4. Seed title, with seed version number. **No publication date** for the seed — judged not useful to a reader at this stage; the module's own publication date is the relevant one.
5. Seed Architect name — dynamically pulled, same mechanism as field 3.
6. Endorsement status badge — binary yes/no (whether the module's primary seed currently has at least one educator endorsement), **not a count**.
7. AI attestation declaration (Section 9.4).
8. Legible Novelty logo, bottom corner of the page.

#### 15.2 Explicitly Excluded from the Title Page, With Rationale

- **Any raw count** (endorsement count, recommendation count, downloads, completions): these are transient and would make a printed copy look stale almost immediately. The endorsement-status binary (field 6 above) is, strictly, transient in the same sense — an endorsement could change at any moment, and the badge reflects state only as of that specific download — but this is a deliberate, accepted exception for a binary flag rather than a case where the no-transient-data rule doesn't apply. A separate verification step to confirm endorsement status independent of normal generation was judged not worth the added complexity.
- **Associated commission reference:** judged to be webapp-side discovery metadata useful for search, not something that helps a learner engage with the content in front of them — deliberately kept off the printed artifact.
- **Flair tag indicators:** same reasoning as commission reference; also currently moot since flair implementation itself remains deferred (Section 5.3, Section 18).

#### 15.3 Cover Graphic Governance

The Module-Author-selected cover graphic is governed by the same reporting/moderation pipeline as the rest of the module (Section 10.4) — there is no separate licensing or content-moderation check at submission time; author attestation covers it, consistent with the platform's general approach to content review.

---

---

#### 12.1 Lesson Plans

**Structural model: a playlist, not a formal curriculum object.**
- Any community member may create a lesson plan — no role restriction, no Verified Educator requirement.
- A lesson plan is an ordered list of existing published modules: add, remove, reorder.
- No content restrictions or quality gate at creation, consistent with the platform's general pattern of letting usage signal quality rather than gatekeeping creation — a poorly constructed lesson plan simply won't get assigned or used.
- Lesson plans can be published as publicly accessible and searchable.

**Creator and assigner are distinct, separately tracked roles.** The creator builds and owns authorship credit for a lesson plan. The assigner is whoever assigns a (possibly someone else's) published lesson plan to specific learners. A teacher may build their own lesson plan, or find and assign one a colleague published — these carry different data implications and are tracked as separate relationships.

**Eligibility to assign:** assigning a lesson plan does **not** require Verified Educator status. This is a deliberate inclusion decision, extending the feature to homeschooling parents, tutors, and other informal teaching relationships that don't fit the credentialed-teacher model.

**Tracking dashboard:** the assigner (not necessarily the creator) gets a tracker table showing per-learner, per-module completion status for everyone they assigned that lesson plan to. Filterable by date range, specifically to support reusing the same lesson plan across multiple cohorts/years without conflating data between them. Each assignment instance is its own object — lesson plan + assigner + assigned learner(s) + date range — not merely "lesson plan published."

**Completion submission mechanic:** when a learner finishes a module reached via lesson plan assignment, they are automatically prompted to send results to whoever assigned it to them, subject to the same logged-in/verified-account gating described in Section 7.4.

**Cross-reference:** Big Questions archives (per-module, read-only) are freely readable without an account, consistent with this Part's scope, but the full submission/answer/append mechanic is documented as a whole in Communication (Section 11), since its actual content is too interwoven with author-review and participation workflow to split without damaging it. Read the archive here; the mechanic behind it lives there.

---

## Part II — Workshop

### 5. Seeds and Modules

#### 5.1 Learning Seed

A structured artifact, authored by a Seed Architect, defining:
- **The learning objective**, expressed as a goal criterion rather than a list of problems (e.g., "the learner can multiply a single-digit number by any double-digit number" rather than "solve these twelve multiplication problems").
- **The entry prerequisite**: what a learner needs to already know to engage with it properly.
- **Algorithmic constraints**: the numerical, structural, or conceptual bounds within which the objective is satisfied (e.g., multiplier ∈ [2,9], multiplicand ∈ [10,99]), which allow the Module Author to draw actual numbers and examples from the special-interest context rather than having them baked into the seed.
- **An intended lesson size / scope field**, explicitly declared rather than left implicit.
- **Taxonomy placement**: Subject and Topic (Section 6).
- **Grade range** (description, not a single number — see Section 6.3 for why).
- **Target learner characteristics** (optional metadata).
- **Associated commission**, if applicable (Section 13).

A Learning Seed carries no domain flavor. Its purpose is to be minimal and reusable across many special-interest domains. The goal-criteria format decouples the pedagogical objective from any specific data inputs, allowing the Module Author to embed the numbers and examples inside the logic of the special interest, while the seed's constraints ensure the underlying academic objective is still met. This also simplifies end-of-line quality control: a reviewer checks whether the special-interest context satisfies the seed's explicit constraints, not arbitrary numbers on a worksheet.

#### 5.2 Module Authorship

A Module Author takes a Learning Seed and builds a structural connection between it and a specific domain (a special interest), producing a Contextualized Module.

**A Module has exactly one primary Seed.** This deliberate bounding constraint defines what the Module is required to teach and is the claim that Verified Educator endorsement actually vouches for. Allowing multiple co-equal seeds per module would require the author to improvise curricular integration without educator advisement.

**A Module may also list secondary Seeds**, accommodating modules whose domain context is genuinely compatible with multiple, otherwise-unrelated curricular areas. Secondary seeds:
- do not need to be taught to the same bounded rigor as the primary seed
- are proposed, not committed, until independently endorsed (Section 5.3)
- if a Module legitimately depends on a second seed *sequentially* (a true prerequisite relationship rather than parallel relevance), that relationship should be expressed through prerequisite/follow-on metadata between Modules (Section 6.4), not through the secondary-seed mechanism, which is for parallel relevance only

If an author needs material that doesn't yet exist as a Seed, the correct path is a Seed Commission (Section 13), not writing seed-equivalent content inside the Module.

**Secondary seed mutability (resolved):** the secondary seed list locks at submission to Pending Review. Authors cannot add, remove, or swap secondary seed tags after submission, which prevents post-publication discovery-gaming via tag swapping.

**Secondary seed cap:** capped at 3 per Module. An unendorsed secondary seed tag carries no trust and cannot satisfy any search-ranking or default-filter advantage, which structurally blocks the obvious abuse vector (tagging popular seeds purely to inflate discoverability — a tag does nothing until a Verified Educator independently endorses that specific claim). The cap exists instead to bound review-queue noise from a single module proposing many marginally-related secondary seeds, not to prevent gaming.

#### 5.3 Contextualized Module — Metadata

A published Module carries:
- its primary Seed (with seed version, see 5.5)
- any secondary Seeds (proposed/endorsed status per seed)
- prerequisite and follow-on relationships to other Modules (via seed chains, Section 6.4)
- intended lesson size / scope (inherited consideration from the primary Seed)
- version / publication date information (relevant to PDF generation, Section 15)
- AI generation attestation (Section 9.4)
- associated commission, if applicable, with a frozen snapshot of the commission description at time of publication (Section 13.4)
- pre-publication review report text (Section 8)
- **flair tags**: optional, self-declared metadata indicating human-authored supplemental materials (crossword, word search, maze, hand-drawn art). Not moderated for accuracy but subject to the same community-correction visibility as other content. Available only in Wholly Human-Crafted and AI-Assisted modes — never available to AI Pipeline modules, since flair by definition requires human creative input. **Implementation status: groundwork only.** Reserve a `flair_tags` field (array, nullable) on the module schema now; full upload/template UI is deferred to a later version (Section 18).

#### 5.4 Module Lifecycle

```
Draft → Pending Review → [Moderation Hold] → Published
```

There is no automated Archived state for seeds or modules (in contrast to commissions, which do expire automatically — Section 13.5). Archiving, if it occurs at all, is manual only, initiated by the author or a System_Admin.

- Moderation Hold is optional and re-entrant; while a Module is in this state, only Moderators can search for or view it.
- **Trigger conditions:** Moderator discretion at any time, the report-escalation system (Section 10.4), or the pre-publication AI review (Section 8) flagging a hard error.

#### 5.5 Version Control

**Version increment triggers:** any author edit to a published module, or any author-implemented change made in response to a community comment (Section 11). "Version" specifically means a distinct published release (the moment the author hits publish), not every autosave.

**Endorsement and recommendation persistence across versions:** all endorsements and recommendations persist regardless of version changes. Display: current-version count in white text; sum of all prior-version counts in light grey, prefixed with "+". Sorting always uses the total combined count — the visual split is purely informational, communicating how much feedback exists on the current version without changing ranking behavior.

**Edit scope:** everything is editable post-publication, with specific exceptions and special handling:
- The **seed reference** can be changed (use case: a better or more popular seed chain becomes available) but triggers special attention in the pre-publication AI review (Section 8), which throws an error if the module's content does not satisfy the new seed's constraints.
- **Commission association** can be changed in either direction — attached, detached, or reattached — because a module may be created before a matching commission exists.
- **AI attestation** can be changed unless it is set to AI Pipeline, in which case it is permanently locked and cannot be changed to Wholly Human-Crafted or AI-Assisted.
- The **commission snapshot** (Section 13.4) is frozen at original publication regardless of any later edits to anything else on the module.

**Seed versioning and dependent modules:** modules remain permanently tied to the specific seed version they were built against. A seed revision does not retroactively affect, invalidate, or require review of any existing module built on a prior version. The seed version string displays alongside the seed reference anywhere it appears on a module (title page, metadata). New modules built after a seed revision use the new version going forward; old versions remain permanently accessible and citable.

**Endorsement-timing protection ("edited under you" warning):** any edit made before the current version receives its first endorsement or recommendation is unflagged and unrestricted. Once the current version has at least one endorsement or recommendation, any edit within the past hour triggers a warning to the next person attempting to endorse or recommend, regardless of the edit's scope (no minor/major distinction is made). The warning includes a line-count delta in a pull-request style ("4 lines were modified in the past hour") so the endorser can judge significance themselves.

---

---

### 6. Seed Taxonomy and Chaining

#### 6.1 Taxonomy Structure

Two-level taxonomy: **Subject → Topic.**

- Subject examples: Mathematics, Literacy, Science
- Topic examples (within Mathematics): Counting, Addition, Subtraction, Multiplication, plus **Miscellaneous** as a first-class topic for alternative calculation methods, enrichment content, and seeds that don't fit cleanly into a single progression (e.g., number theory, mental math strategies)

No third taxonomy level. A deeper, stage-within-topic structure was explicitly considered and rejected: it introduces governance overhead (who maintains stage definitions, how stages get added) disproportionate to the benefit, and risks lock-in if a single weak seed occupies a narrowly-defined slot. Subject → Topic is enough structure to support chaining and discovery without that overhead.

This structure is also deliberately grade-independent: different countries and curricula teach the same topic at different ages, so grade is a separate field on each seed (Section 5.1), not a taxonomy level. The taxonomy is the universal skeleton; grade-appropriateness and content language are local to each seed.

#### 6.2 Seed Placement and Governance

- The Seed Architect places their own seed in Subject → Topic at creation time. Self-placement was chosen deliberately: architects know their content well enough to place it correctly, and a second set of eyes happens naturally at the endorsement step.
- The endorsing Verified Educator confirms or flags taxonomy placement as part of their endorsement review. If flagged, the seed returns to Draft for the architect to revise (via the same comment-layer mechanism used for draft review, Section 7.1) before endorsement is granted.
- An architect can revise placement at any time based on community feedback after publication.
- Core taxonomy categories (Subjects and Topics) are defined and maintained by System_Admins. Verified Educators may propose new Topics; admins approve. The taxonomy is versioned — adding a Topic does not break existing seed placements.

#### 6.3 Why Grade Is a Description, Not a Sortable Field

Seed and module grade range is recorded as a free-text description rather than a structured, sortable numeric field. This was a deliberate choice: a Seed Architect browsing for material is better served by knowing the actual intended grade context than by an arbitrary number that may not map consistently across countries or curricula. Subject and Topic remain the primary sortable/filterable fields; grade is informational context within them.

#### 6.4 Seed Chains and Module Chaining

**Chains are defined at the seed level, within a Topic** — a Seed Architect designates one or more seeds as natural follow-ons to their seed. This is a directed relationship (Seed A points forward to Seed B), and multiple competing chains can exist within the same Topic.

This was deliberately decoupled from the taxonomy structure itself (an earlier, three-level taxonomy concept with seeds competing for fixed "slots" was considered and rejected as introducing the exact lock-in problem chaining is meant to avoid). Because multiple seeds can occupy the same conceptual position within a Topic and form independent chains, a weak seed in one chain does not affect any other chain in the same Topic — learners and educators gravitate toward stronger chains via the existing sort signals (Section 9.3) rather than the platform enforcing a single canonical path.

**Module chaining is inherited from seed chaining.** A module built on a seed that has a chain relationship to another seed automatically participates in the corresponding module-level chain. A "what's next" panel at module completion surfaces modules built on follow-on seeds, filtered to the learner's interest domain where possible.

**Miscellaneous seeds** associate with a primary topic stage via metadata ("enriches this content within Topic Y") rather than a chain relationship, since they enrich rather than advance — this keeps them discoverable as supplementary content without forcing them into a linear progression they don't belong in.

**Planned feature:** a curriculum map view — a visual representation of the taxonomy with coverage indicators showing which Subject/Topic areas have endorsed seeds and which are sparse or empty. Deferred to a later build phase, but the backend must support coverage, gap, density, and language-coverage queries from day one so this feature doesn't require a schema change when it's built (Section 18).

---

---

### 7. The Authoring Workflow *(split — 7.3/7.4/7.5 are in Part I: Library)*

#### 7.1 Seed Draft and Review

**Draft sharing model.** A draft seed is private to its Seed Architect by default. Two alternative approaches were considered and rejected: an external tool like Google Docs (no platform integration, and critically, it muddies attribution if reviewers' suggested edits get merged directly into the architect's words) and full real-time collaborative editing via TipTap+Yjs (over-engineered for short structured documents, and requires standing up a separate sync-server infrastructure component).

The adopted model: the architect invites **specific registered accounts** (not open share links) to view the draft and leave threaded comments. The architect resolves or dismisses comments entirely at their own discretion — no external edits ever merge directly into the draft, preserving a clean, single-author attribution line. Share access automatically revokes on submission to Pending Review. Comment history is retained internally but never publicly visible on the published seed.

**This same comment-layer infrastructure handles the endorsement back-and-forth.** When an endorsing Verified Educator has concerns about taxonomy placement or seed structure, they leave a comment, the seed returns to Draft, the architect revises and resubmits. One system serves both use cases.

#### 7.2 Module Authoring

**V1 ships with a single authoring path: Wholly Human-Crafted or AI-Assisted with Manual Flair.** Direct authoring in the TipTap editor (selected for its extensibility, active maintenance, and custom-node-type support — see Section 17.3 for the full tooling rationale). Fillable fields are implemented as custom TipTap node types: each field carries a unique author-assigned identifier, used both for scoring and for progress-saving (Section 7.5). An author who uses their own external AI tools (their own account with any provider) to help draft content, then adapts and edits it manually before pasting it into the editor, attests honestly at submission (Section 9.4) — this costs the platform nothing, since no platform-hosted inference is involved.

---

### 10. Quality Control and Moderation

#### 10.1 Why Accuracy in Enrichment Content Is a Trust Issue

Factual accuracy in domain-enrichment content (the special-interest context layer of a module) is treated as a trust issue, not merely a content-moderation problem. A single discovered factual error in enrichment content can undermine a learner's confidence in all content from that source, since enrichment content is not formally tested and is accepted largely on trust. Accuracy here is part of the platform's credibility, not a side QA step.

#### 10.2 Layers of Quality Control

**Layer 1: Author attestation.** On submission, the author certifies that all factual claims are accurate to the best of their knowledge and that reasonable effort was made to verify them. Cheap, scales without staffing cost, creates a documented standard of care.

**Layer 2: Automated flagging.** The pre-publication DEF review (Section 8) flags content for human attention but does not itself make correctness determinations on factual claims — it identifies likely errors, contradictory statements, unsupported numerical claims, and obvious misconceptions, routing ambiguous cases to a human rather than auto-rejecting.

**Layer 3: Publication is AI-gated, not contingent on mandatory human pre-publication review.** If the pre-publication AI review (Section 8) does not flag a hard error, the module publishes without a moderator in the loop. Moderators remain available to review any module at any time at their own discretion (Section 10.4), but their involvement is not a precondition for publication. When a moderator or a report-triggered review does examine a module, the goal-criteria seed format (Section 5.1) simplifies their task to a checkable question — does the special-interest context satisfy the seed's explicit constraints — rather than requiring evaluation of arbitrary content from scratch.

**Layer 4: Community correction, reframed as comments.** Community members do not submit formal "corrections" with an accept/reject workflow. They submit comments (Section 11.2), which the Module Author handles entirely at their own discretion — reading, deciding whether to agree, and editing the module directly if they do. There is no formal correction-acceptance state machine; an author-implemented edit made in response to a comment simply triggers a normal version increment (Section 5.5) like any other edit.

#### 10.3 Liability Posture (Not Legal Advice)

This design was evaluated against the question of whether AI-gated publication without mandatory human pre-publication review creates undue liability exposure, given the platform's largely-minor user population. The relevant reasoning:

- Section 230 (US) generally protects platforms from liability for user-generated content, provided the platform is not itself authoring the harmful content and makes reasonable, prompt moderation efforts once notified. Publish-first, moderate-reactively is the standard operating pattern across the entire industry at scale, not a unique risk being introduced here.
- COPPA risk is concentrated in data-collection practices, which are substantially mitigated by the account-free reading model and the parent-consent architecture (Section 3), not by content-moderation timing.
- The genuine residual risk is the AI filter's false-negative rate on the single highest-severity category: content that is nominally on-topic for its stated seed but uses an inappropriate vehicle (e.g., a sexualized or otherwise inappropriate visual comparison as the carrier for an unrelated academic objective).
- **This specific design decision — AI-gated publication, no mandatory human review — should be reviewed by an actual lawyer before launch.** This is flagged explicitly as the one system-design decision on the entire platform where AI-assisted design reasoning is not an adequate substitute for professional liability advice, given the population served and the cost of being wrong.

#### 10.4 Report-Driven Takedown

The community reporting system functions as the platform's primary liability backstop in place of mandatory pre-publication review, and a low-friction, easily discoverable reporting UI is treated as load-bearing for this argument, not merely a UX nicety — the realistic time-to-second-report directly determines the worst-case exposure window for anything that slips past the AI filter.

- **1 report** on content with no prior moderator review → enters the Moderation Hold queue.
- **2 reports from different users** on content with no prior moderator review → automatic takedown, pending moderator review.
- **Once a moderator reviews and clears a specific version, the automatic-takedown trigger is permanently disarmed for that version.** No further number of reports will auto-takedown it again — subsequent reports route to the queue only, flagged "previously reviewed." This closes the brigading vulnerability: a coordinated reporting campaign gets exactly one shot at forcing a review per version.
- **Publishing a new version re-arms the automatic-takedown trigger fresh**, since a new version is treated as substantively new content.
- **A Moderator's manual takedown authority is absolute and entirely independent of all automated state** — a moderator can take down any seed or module at any time, including a previously-cleared version, but must supply a brief rationale, creating an accountability trail without meaningfully slowing genuine action.

---

**Settled placement:** review is inseparable from the authoring pipeline a module isn't complete until it clears (Section 8), so it belongs with the content it gates rather than as a standalone subsystem.

---

### 13. Commission Marketplace

#### 13.1 Two Commission Types

- **Seed Commission:** a request for a new Learning Seed. Fields: Subject, Topic (taxonomy), free-text description (400 character maximum, with the field's UI guiding what information to include — grade level description, intent, target learner characteristics), AI assistance designation (No AI assistance / AI-Assisted / AI-Generated), poster identity (Verified Educator flag sorts to top).
- **Module Commission:** a request for a Contextualized Module against an existing Seed. **Cannot be posted without specifying an existing Seed** — this is deliberate, not an oversight. A Module Commission with no Seed to anchor it doesn't serve the bounding method the platform is built around, even though the underlying need (a learner wants a module on a topic with no seed yet) is understandable. The correct path for that need is a Seed Commission instead. Fields: associated Seed (required), special interest domain, clarification of intent (minimum 100 characters, maximum 400, enforced at submission), AI assistance designation (same three-tier as Seed Commission), poster identity.

Neither field structure includes a sortable numeric grade field — grade is described in free text within the 400-character description, for the same reason described in Section 6.3: a description is more useful to a Seed Architect browsing commissions than an arbitrary number.

To close the loop when the underlying need was for a module but no seed existed yet: when a Seed Commission is fulfilled, the original commissioner receives an automated email asking whether they would now like to post a Module Commission based on the newly available Seed.

#### 13.2 Posting and Support

**Posting is not role-restricted** — any Community Member may post either commission type. A commission posted by a Verified Educator is flagged as such and sorts to the top of listings.

**Support button** (increases a commission's visibility) is available to Community Members under the same eligibility gate as recommendations (Section 9.5): account at least 7 days old, completed profile.

#### 13.3 The Bulletin Board Model

Commissions are not a ticketing system with a single claimant. A commission remains open and visible until a fulfilling seed/module is published — multiple Seed Architects or Module Authors may work toward the same commission simultaneously, with no claim lock-out, only the existing 14-day "claimed" visual warning (Section 13.6). All fulfillments are treated equally; there is no "winner" mechanic.

**Following and fulfillment notification:** any community member may follow a commission. On fulfillment, the commission creator and all followers are notified via onsite notification and email (subject to opt-out settings, Section 16). On fulfillment, the commission closes and remains visible at the bottom of the active list for 14 days before dropping from the active list (it is never deleted from the database, regardless).

**Reopen mechanic:** the commission creator has a 14-day window post-fulfillment to reopen. Reopening **requires** the creator to edit the commission description — the underlying assumption is that the original brief was unclear, not that the published work was poor quality. Followers are notified "commission reopened" along with the new description text. Reopening does **not** affect any already-published seed/module attached to the commission — they remain published, unaffected, and stand on their own merits; reopening does not retroactively judge prior fulfillments.

#### 13.4 Commission Snapshot on Published Artifacts

When a seed/module is published against a commission, the commission's description text is snapshotted onto the seed/module record at the time of publication. This preserves the exact brief the author worked against regardless of any later edits to the commission, and resolves the transparency concern (what if the commission changes after multiple people have worked against it?) without requiring full version history on the commission object itself — each fulfilling artifact simply carries its own frozen copy of the brief it answered. A manual association added after the fact (rather than via the autofill button, see 13.5) snapshots the commission text at the time of association, not at the time work actually began.

#### 13.5 Seed/Module Association

Seeds and Modules each carry an `associated_commission` field, which autofills if creation was initiated from the commission view ("start seed/module from this commission" button), or can be added/changed manually after the fact on a pre-existing seed/module — covering the case where a module was created before a matching commission existed, or where an author wants to reattach to a more relevant or popular commission later.

#### 13.6 Claims and Expiry

- Claiming a commission lasts 14 days as a default state and does not lock the commission — it only signals to others that someone has already started, reducing (but not preventing) duplicated effort.
- **Warning logic:** a "claimed" warning is shown if the claim itself was made within the last 14 days, **or** an associated Draft was last updated within the last 14 days, whichever is more recent. Once both fall outside the 14-day window, the warning is removed; the commission remains available to claim and work on at any time regardless.
- Commissions expire after 1 year (a tunable parameter). Expired commissions stop displaying on the active list but are never deleted from the database — they remain accessible via direct link and are a candidate future input to the planned curriculum gap analysis / curriculum map view (Section 6.4).

---

**Settled placement:** kept whole in Workshop, including posting/browsing/supporting, rather than split from fulfillment, since the whole feature exists to drive content creation.

---

## Part III — Certification Center

### 4. Verified Educator Status *(split — 4.1/4.2 are in Part IV: User Management)*

#### 4.3 LNC (Legible Novelty Certified) — A Distinct Path to Endorsement

Legible Novelty Certified (LNC) is a separate credential from Verified Educator status. It grants the same functional endorsement ability (Section 9.1) without conferring Verified Educator status itself and **without the ability to grant peer tokens** (Section 4.2). It exists for community members who can demonstrate the judgment endorsement requires, evaluating whether a seed or module is sound, without holding a teaching credential. Withholding token-granting power specifically contains the accountability risk to a single hop: an LNC-holder's misjudgment on an individual endorsement cannot propagate further by vouching someone else into the system, the way a bad Verified Educator token grant could.

**Revenue structure, and why it is decoupled from pass/fail:** the training course is paid; the certification test itself is free and may be retaken without limit and without repeating the paid training. The platform is paid identically regardless of how many attempts a candidate needs to pass, which removes the specific incentive that would otherwise exist to lower the test's rigor in order to keep certifications, and the revenue tied to them, flowing.

**Displayed distinctly, not folded into Verified Educator status.** LNC and VE are visually and functionally separate badges (Section 21), specifically so a viewer can tell how endorsement ability was earned: a vouched-for professional credential, versus demonstrated, tested competency. Blending the two into one undifferentiated badge would obscure that distinction the same way a shared, unlabeled status would.

**Co-occurrence with Verified Educator status is permitted, not restricted.** An existing Verified Educator may also complete LNC training and certification; both badges display simultaneously (Section 21.2). LNC does not supersede, require, or get subsumed by VE status.

#### 4.4 Framework Onboarding (VE-Specific) — Placeholder

**VE-only, not part of LNC.** LNC's existing paid training already teaches Legible Novelty's framework and criteria as part of its curriculum (subject to confirmation — Section 4.3); the VE path currently has no equivalent, verification confirms someone is a credentialed educator, not that they understand this framework's specific criteria before their endorsement carries weight. This entry exists to close that gap.

**Required: a video tutorial on Legible Novelty, with a pass requirement, gating endorsement activation.** No retroactive requirement — every future VE applicant goes through this; there are no existing Verified Educators to migrate, since the platform is not yet built.

**Structure only — deliberately left undecided for now:**
- What "pass" means (comprehension quiz vs. completion tracking)
- Where this sits relative to the existing verification paths (Section 4.1) — before verification begins, or as a final gate after verification succeeds, before endorsement activates
- The video's actual content/script

---

---

## Part IV — User Management

### 2. Roles, Account Characteristics, and Identity

#### 2.1 Roles (mutually exclusive, assigned)

- **Community_Member**: base role for any registered account.
- **Verified_Educator**: a Community_Member granted educator status via peer token or manual document review (Section 4). Required to endorse Seeds and Modules.
- **Moderator**: handles Moderation Hold review and reports.
- **System_Admin**: platform administration.

#### 2.2 Characteristics (derived, not assigned)

- **Seed Architect**: applied to any account with at least one Learning Seed that has received an educator endorsement. Publishing a seed alone is not sufficient; the seed must have been independently vouched for. Display-only effect: affects forum/comment-thread presentation (badge), not search privilege or any mechanical effect.
- **Module Author**: applied to any account with at least one Contextualized Module that has received an educator endorsement on its primary seed. Same display-only scope as Seed Architect.

Both characteristics are determined by current endorsement state. If the relevant endorsement is later removed, the characteristic is presumed to be reevaluated accordingly (not expected to be a common case).

#### 2.3 Pseudonymity and Display Names

Account schema includes both `preferred_display_name` and `legal_name`, with a toggle controlling whether `preferred_display_name` is used in place of `legal_name` for public display, including on generated PDF covers (Section 15). This allows a contributor to seek the recognition of Seed Architect / Module Author credit without exposing their real identity — particularly relevant for contributors who may not be ready, or may never be ready, to publicly disclose an autism diagnosis or an identity tied to their special interest.

A contributor may change this setting at any time. Because the PDF cover is generated dynamically at download time rather than fixed at publish time, any future download reflects the current setting automatically — no retroactive re-issuing of past printings is needed.

**Tradeoff to keep visible in user-facing documentation:** a pseudonym protects exposure but caps the credit's external value. A citation count attached to a persistent pseudonym builds standing within the platform but does not transfer to a CV, tenure case, or resume the way the same count under a real name would. The system supports both choices and supports switching between them without losing attribution history under whichever name was active at the time.

#### 2.4 Purged Account Pseudonymous Identifier

When an account is purged (Section 3.5), its display name is replaced by a unique pseudonymous identifier, generated at purge time (not at account creation, so no account carries a dormant identifier it never needs). The identifier is opaque — not derivable from account ID or email — so it cannot be reverse-engineered by someone who knows both the pre-purge display name and the post-purge identifier. This identifier becomes the displayed credit on any seeds, modules, or comments that remain in the archive after purge, with no profile link attached (since none exists post-purge), which makes retroactive analysis of a purged user's prior activity substantially harder than it would be for an active account.

---

---

### 3. Account Lifecycle: Minors, Parents, and Purge

#### 3.1 Date of Birth Collection (All Accounts)

**Every account, not only child sub-accounts, requires a date of birth at creation.** This is retained for the life of the account, not discarded at graduation, and serves two distinct purposes depending on account age: it drives child-account graduation (Section 3.2) while the account is a minor, and it gates the 18+ Share Contact Information action (Section 12.3) once the account is an adult. Retaining this field platform-wide is not new collection beyond what the child sub-account model already required — it is continued use of already-collected data for a second, later purpose, consistent with the platform's general preference for reusing existing infrastructure over building parallel systems (see, for example, the comment system's reuse across drafts, Big Questions, and the forum, Section 11).

The platform cannot prevent a user from lying about their date of birth at signup, and does not claim to; see the honest threat model stated in Section 1.

#### 3.2 Child Sub-Accounts

A child account is a real database record with dependency checks tied to a parent account, not a separate account type bolted on after the fact.

- **Birthdate** is stored but never displayed anywhere on the platform (see Section 3.1 for retention scope).
- **Grade** is stored separately from birthdate and auto-increments mid-August annually (single configurable date, default mid-August; country-specific adjustment deferred — see Section 18).
- **Public identity display**: "A [grade] learner from [Country]." No name, no exact age. Grade was chosen over age specifically because it avoids storing or exposing a derivable birthdate while also being more useful for module relevance than an age bracket.
- A child account can submit Big Questions but cannot participate in the thread after submission (Section 11).
- No private messaging exists on the platform at any age, for any account, with the single narrow exception described in Section 1 and detailed in Section 12.3 — which explicitly does not apply to any account under 18.
- A child account can always read modules without being logged in or in any account state — this is a direct application of the unconditional-public-reading principle (Section 1), and matters specifically because it ensures a self-learner has access to materials that work for them even if a parent is not supportive of them being different.

#### 3.3 Account Graduation

Graduation from a child sub-account to a standard account is **automatic**, driven by the stored birthdate, occurring at the 13th birthday. (Grade, by contrast, is not the graduation trigger — it exists for content relevance and identity display, not compliance.) Progress archive (Section 7.5) carries forward intact at graduation. Graduation at 13 is distinct from, and does not imply, adulthood: a graduated standard account belonging to a 13-17 year old remains ineligible for the Share Contact Information action (Section 12.3) and any other 18+-gated feature, since the stored date of birth continues to be checked against the relevant threshold for each specific feature rather than against graduation status alone.

#### 3.4 Parent Account Deletion and Dormancy

- **Dormant parent accounts** require no platform action. The child sub-account continues functioning normally regardless of how long the parent account has been inactive.
- **Deleted parent accounts**: before deletion completes, a warning gate informs the parent that any attached child accounts will become inaccessible (for new logins) until the child's 13th birthday.
- A child attempting to log in after their parent account has been deleted sees an explanation of the situation and a button to purge their own account immediately rather than wait for graduation — respecting the child's autonomy rather than forcing a multi-year wait on data they may want gone.
- During this holding state, the child can still read all modules anonymously and without restriction, per the unconditional public reading principle (Section 1).

#### 3.5 Right to Be Forgotten / Account Purge

Two distinct operations exist:

**Deactivation:** account suspended, all data intact, fully reactivatable.

**Purge:** PII fields deleted or overwritten; account shell retained for referential integrity, with a reclaim path (below) rather than a plaintext tombstone.

**Fields deleted entirely on purge (not retained in any form, hashed or otherwise):**
- Profile information, country, grade, any optional profile fields
- Date of birth (Section 3.1) — the one exception worth flagging: deleting date of birth removes the basis for the 18+ contact-sharing gate (Section 12.3) and for re-verifying graduation status if the account is later reclaimed; this tradeoff is accepted in favor of full data minimization on purge rather than retaining birthdate indefinitely even through a purge. A reclaimed account is treated as a standard adult account requiring fresh date-of-birth collection if any 18+-gated feature is used, rather than inheriting pre-purge status.
- Progress archive (Section 7.5)
- Language preferences
- Plaintext display name — replaced at purge time by the generated pseudonymous identifier (Section 2.4); the plaintext name is not retained
- Plaintext email address and plaintext password — neither is retained in readable form under any circumstance

**Fields retained, in irreversible hashed form only:**
- Hash of the original email address and hash of the original password — solely to support the reclaim flow below; neither hash is reversible and neither functions as a usable contact method or login credential on its own
- Hash of the original display name — solely to block reuse of that name by any other account (Section 3.5, display name reuse prevention below); not part of the reclaim authentication path in any way

**Fields retained in the clear:**
- Account ID (referential integrity)
- Generated pseudonymous identifier (Section 2.4) — replaces the display name on all remaining content
- System-generated content: modules, seeds, Big Questions responses, comments (display name on this content updates to the pseudonymous identifier, but the content itself is not deleted — see Section 11.2 for the parallel comment-purge behavior)
- Child account associations (which have their own separate purge rights)
- Correction/comment history records

**There is no email tombstone and no automatic block on future account creation.** A purge does not prevent the same email address from being used to create a brand-new account later — a returning person whose only email is the one they used before should not be locked out of the platform by the privacy mechanism that was supposed to serve them. The previous design's tombstone-and-block model is retired for this reason.

**Reclaim flow.** When someone attempts to create an account (or log in) with an email address matching a purged account's stored email hash, they are asked whether they are the original owner of a previously purged account.
1. If they say yes, they are prompted for the old password.
2. If the submitted password's hash matches the stored password hash, a standard verification email (the same mechanism used for any new signup) is sent to the email address they entered.
3. Clicking the link proves current control of that email address. Combined with the password match, this is two independent factors — something they know (the old password) and something they currently have (access to the email) — not a single shared secret.
4. On success, the account is reclaimed: login access is restored, and the person is prompted to set a new display name and provide a current date of birth as part of completing reclaim.
5. If the password does not match, reclaim fails and they are told they may proceed with creating a new account instead. There is no password-reset path for a purged account, since no usable plaintext email exists pre-reclaim to send a reset link to — this is treated as an accepted, deliberate limit on reversibility, not an oversight.

**Reclaim does not automatically restore pre-purge identity to old content.** System-generated content left behind under the purge-time pseudonymous identifier (Section 2.4) stays attributed to that identifier after reclaim; reclaiming an account restores access, not retroactive re-attribution. Re-linking old content to a new display name, if ever offered, is a separate, explicit action the person takes after reclaiming — never an automatic side effect of reclaim itself.

**Display name reuse prevention (a distinct mechanism from reclaim).** The purged account's original display name is hashed and permanently blocked from reuse platform-wide, including by the original owner themselves on reclaim. This hash is not part of the reclaim authentication path in any way — it cannot be used to prove ownership or gain access. Its sole purpose is preventing a different person from registering a well-regarded former contributor's old handle and trading on their accumulated community reputation (endorsements, awards, Module Author / Seed Architect characteristics — Sections 2.2, 14) after they're gone. A reclaimed account therefore permanently loses its old display name and must choose a new one, even though it regains access to everything else still attached to the account.

#### 3.6 COPPA / FERPA Compliance Posture

**COPPA:** verifiable parental consent is required for under-13 account creation. The parent-creates-account-and-grants-child-access model (Section 3.2) is the compliant mechanism; a checkbox is not sufficient consent under FTC guidance. No data is collected from anonymous visitors of any age, which removes most of the COPPA surface area before any account logic is even relevant.

**FERPA:** applies to participating teachers, not directly to the platform. Quiz results and engagement data submitted by a student to a teacher account are education records. Any future research study's retention and engagement data must be held by the academic partner institution, not by the platform itself.

**Practical boundary that satisfies both:** students read without needing an account at all. Teachers have accounts. The platform collects nothing about an individual student unless that student is logged in with a verified account and explicitly chooses to submit results to a teacher (Section 7.5, Section 12).

---

---

### 4. Verified Educator Status *(split — 4.3/4.4 are in Part III: Certification Center)*

#### 4.1 Verification Paths

**Path 1's AI-assisted screening is Phase 2, per the platform-wide no-AI-in-Phase-1 scope decision (Section 22). Phase 1 ships this path as fully manual review, described below; the AI screening layer is added on top of the same human-reviewer workflow once Phase 2 begins, not built as a separate path.**

The email-plus-directory-lookup path (below) is attempted first for any applicant who has an institutional email address. The peer token exists specifically as a fallback for the cases that path structurally cannot resolve, not as an equally-weighted parallel option — narrowing its role this way reduces how often a Verified Educator is asked to vouch for a stranger with no other path attempted first, and reflects a deliberate judgment that uncredentialed contributors having endorsement capability is not valuable to the platform (in contrast to lesson plan assignment, Section 12.1, which is deliberately open to uncredentialed instructors for a different reason).

**Path 1: verification via institutional email and directory lookup (attempted first).** This path is structured by audience, not as a single generic document-upload flow:

- **K-12 teachers and professors:** no document upload. **Phase 1: every application routes directly to a human reviewer**, who checks the applicant's institution against its public faculty/staff or institutional directory and confirms the applicant's name appears there; if confirmed, a verification email with a confirm link is sent to the institutional address. For K-12 specifically, the maintained state/jurisdiction teacher registry lookup table (Section 17.4) remains available to the reviewer as a manual reference regardless of AI involvement, so this infrastructure is not wasted by the Phase 1 scoping — it simply serves the human reviewer directly instead of an AI pre-pass. **Phase 2** adds an AI first-pass ahead of the reviewer (identifying the institution from the email domain, searching the directory, routing only unresolved cases to the human reviewer), narrowing the human review queue to the cases the automated pass couldn't resolve, rather than every application.
- **Teaching credential/license holders without an institutional email path:** this is the one credential type that retains an actual document-upload and human-review path, specifically because it is the one type with a real external verification mechanism available — a state licensing board registry. **Phase 1: the human reviewer performs document-consistency screening directly** (does the submitted document look genuine, do the extracted fields match the application) and manually checks the relevant jurisdiction's registry. **Phase 2** adds an AI pre-screening pass ahead of the reviewer, same relationship as the K-12 path above.

**Explicitly excluded from the document-upload surface entirely:** proof-of-employment documents (pay stubs, employment letters) and graduate enrollment letters. Both were considered and rejected: pay stubs are sensitive financial documents that create unnecessary handling and storage obligations, and neither document type has any external source of truth an AI or human reviewer can check against — only internal consistency, which is exactly what a competently forged document would also pass.

**ML feedback loop — Phase 2, and moot until then.** Human rejection decisions, with a reason code, become training signal that improves the AI screening pass over time, once that pass exists. Worth still capturing reason codes on every Phase 1 rejection regardless, since that data has value the moment Phase 2's screening is built and needs a training signal to start from — capturing it from day one costs nothing and avoids a gap in the historical record.

**Operational note worth being explicit about:** Phase 1's all-manual review means every single VE application, not just the ones an eventual AI pass couldn't resolve, requires a human reviewer's time. This is a real, ongoing workload difference from the Phase 2 design, not a cosmetic one, worth planning reviewer capacity around rather than discovering as a bottleneck once applications start arriving.

**Path 2: Peer token (fallback for credentialed educators with no searchable directory; primary and only path for graduate students).**

- **Educators with a real credential but no institutional email, or whose institution has no public/searchable directory:** the token path exists specifically for this gap. The applicant is, by assumption, already credentialed — the token is solving a discoverability problem (the AI cannot find them), not a credentialing problem.
- **Graduate students: peer token only — no manual review path exists for this population, and the token is the primary path rather than a fallback for this group specifically.** This is a deliberate exclusion of any document-based path, not an oversight. Verified Educator status gates endorsement ability specifically — it does not gate authorship, the Module Author or Seed Architect characteristics, or Big Questions participation. A graduate student can publish excellent seeds and modules, accumulate endorsements from existing Verified Educators on their work, and earn the Module Author or Seed Architect characteristic without ever holding Verified Educator status themselves. If endorsement capability is needed before graduation, any Verified Educator (commonly a faculty supervisor) can issue a peer token — a stronger trust signal than a self-submitted enrollment letter would have been, since it comes from a real, accountable person rather than a document checked only for internal consistency.

**Token mechanics:** every Verified Educator account holds 1 token at a time, grantable to another account to immediately confer Verified Educator status. A used token refreshes after **1 month** (slowed from an earlier 14-day refresh specifically to reinforce that the token is a fallback mechanism, not a routine onboarding route). This mirrors arXiv's peer-endorsement model for new category submitters: a credentialed insider vouches for a newcomer, with the endorser's own standing implicitly attached to the act of vouching.

**Educator token-request subforum:** token requests happen in a dedicated subforum, not through private contact between an applicant and an individual educator. A Community Member applies to view the subforum; the application requires a rationale (their credentials, institutional context, why the automated path failed for them), and that rationale **auto-posts publicly as a new thread in the subforum** at the moment of application. The applicant does not gain access to the subforum itself until a token is granted — they cannot browse other applicants' threads, the general educator discussion, or responses to their own thread in real time. Verified Educators therefore make the token-grant decision based on the submitted rationale alone; there is no back-and-forth with the applicant before the decision is made. This is intentional: the rationale field is the applicant's opportunity to make their case fully, and the absence of a clarification channel keeps the process simple and avoids creating a private-contact surface. If a rationale is clearly insufficient, the reviewer can simply not act; if it is sufficient, they grant the token. The applicant is notified when a token is granted.

Both paths, once granted, produce identical Verified Educator status with no visible distinction in badge or permissions.

#### 4.2 Peer Token Accountability

If a Verified Educator grants a token to an account later found unqualified, the granting educator receives a lightweight flag on their account once the bad token is confirmed, reviewed by a Moderator. This is intentionally a soft consequence — a tactile penalty without being chilling to legitimate vouching of colleagues — rather than a punitive reputation system. Without some response, the token path risks becoming a rubber-stamp mechanism, the same failure mode arXiv's own endorsement system guards against. This accountability mechanism applies equally regardless of whether the vouched-for account was a fallback-path educator or a graduate student.

---

#### 12.2 Connections

**"Connection"** is the term for a mutual, explicitly accepted relationship between two accounts, purpose-built for lesson plan assignment. It is not a social or messaging feature and carries no implications beyond assignment eligibility.

**What a Connection grants:** eligibility for direct, un-gated lesson plan assignment going forward, without per-assignment approval. A Connection exists for this single function; it is not a general social or messaging feature.

**Connections never auto-form, for any account type.** Every Connection requires an explicit request and explicit acceptance, with exactly one defined exception (invite-link case below).

**Adult-to-adult assignment:** requires either an existing Connection, or a raw (non-public, not visible on the recipient's profile) email address as the targeting mechanism. No Connection auto-forms from a successful email-based assignment — it remains a one-off action unless a Connection is separately requested and accepted.

**Adult-to-child assignment — two distinct pathways, each with its own parent approval type:**

1. **One-time assignment pass.** An adult with no existing Connection to the child invites the child to a specific lesson plan → routes to the parent for approval → parent approving grants access to that single assignment only → does **not** create a standing Connection → the adult retains no ability to assign anything further without going through parent approval again from scratch.
2. **Standing Connection.** A separate request type, also requiring parent approval. Once approved, the connected adult can assign future lesson plans directly to the child without further per-assignment approval.

**Critical UX safety requirement, flagged for build phase:** these two parent approval types must be visually and functionally distinct in the parent-facing approval interface, so a parent cannot mistake "approve this one lesson plan" for "grant this person standing access to my child." This is treated as a child-safety-relevant interface requirement, not a UX nicety.

**Invite-link auto-acceptance (the one exception to "Connections never auto-form"):** following an invite link generated specifically for a lesson plan assignment, when that link leads to new account creation, results in the new account both auto-accepting that specific lesson plan assignment and auto-establishing a Connection with the assigner. This is justified because the deliberate act of following the invite and creating an account in direct response to it constitutes clear, affirmative consent to both the assignment and the relationship — it is not a passive or accidental connection formation.

#### 12.3 Share Contact Information

The platform has no general private-messaging system, for any account, at any age (Section 1). This creates a real product problem distinct from the educator token-request case (Section 4.1): two adult collaborators who meet through the platform and want to continue working together elsewhere have no safe way to exchange contact information, which is a lock-in problem, not a safety feature. Two alternatives were considered and rejected before settling on this design: public disclosure (posting an email address in a visible thread) was rejected because it permanently exposes the address to anyone who finds the thread, including bad actors who never had to do anything to find it; general DM functionality was rejected because it reopens the exact messaging surface the platform deliberately avoided, and would require correctly identifying which conversations are adult-to-adult versus adult-to-minor across every use case rather than a single bounded one.

**The resolved feature is a single bounded action, not a messaging channel:**

- **"Share Contact Information"** is a one-time action, not open-ended conversation. It is not a DM system and should not be built or described as one.
- Available **only** between two accounts with an existing, mutually-accepted Connection (Section 12.2) — never available to strangers, and never as a way to initiate a Connection.
- Available **only** between two accounts that are both 18 or older, per the date of birth retained at account creation (Section 3.1). The button does not appear at all on any account belonging to someone 17 or under — including a graduated (13-17) standard account, which is distinct from an 18+ account despite no longer being a child sub-account (Section 3.3). An adult account cannot offer to share contact information with a minor account under any circumstance.
- This is the **only** exception to the platform-wide no-private-messaging rule (Section 1), and is not a precedent for adding general messaging later without an equally deliberate, separately justified decision.

---

---

### 14. Awards System

Awards are a lagging, earned recognition, not a real-time ranking metric and not awarded automatically. This keeps the incentive pointed at doing good work and becoming known in a domain, rather than at gaming a visible indicator.

#### 14.1 Attachment Targets

Awards may attach to three different target types:
- **Accounts directly** — domain-specific expertise recognition (e.g., "Bug Expert"), quality-of-engagement recognition (e.g., "Great Explainer," for thorough Big Question answers), and contribution-volume recognition (e.g., "Prolific" in a domain).
- **Seeds**
- **Modules** — e.g., "Best Math Module of 2026"

#### 14.2 Content-Award Inheritance

When a seed or module wins an award, the creator's account inherits the *right to display* that award — not the award record itself, which remains permanently attached to the content. The displayed badge becomes one of the account's selectable badges, shown next to their avatar in comment threads and forum posts. The award instance and the display right are two related but distinct records: the award belongs to the content permanently; the display right is a derived privilege on the creator's account.

#### 14.3 One-Time-Only Constraint and Date-Scoped Cycles

An account cannot hold the **same award instance** more than once. Award categories, however, are date/cycle-scoped recurring templates — "Best Math Module of 2026" and "Best Math Module of 2027" are two entirely separate award instances under the same recurring category. This means the same creator **can** win the same category in a later cycle without violating the one-time rule, since each cycle is a distinct instance.

**Display normalization:** the account-facing badge does not reference the specific year — it displays generically (e.g., "Best Math Module of the Year Winner") regardless of which cycle's instance was won. A multi-year winner's badge doesn't look stale or need updating, and a creator who has won the category across multiple cycles doesn't end up with several confusingly similar badges to choose between.

**Schema implication:** award categories exist as recurring templates; each actual award is a dated instance attached to a specific winning seed/module and that work's creator account at time of granting; an account's selectable display badges are derived from the distinct *categories* the account has won at least one instance of, not from individual dated instances.

#### 14.4 Eligibility, Nomination, and Adjudication

**Eligibility benchmarks:** minimum thresholds for nomination eligibility (e.g., "Prolific" in a domain requires a minimum published, endorsed module count in that domain). Specific thresholds are not defined here and should be set operationally once the platform has enough activity to calibrate meaningful minimums.

**Nomination:** any Community Member may nominate a contributor, seed, or module, with a **required brief written rationale** — not a one-click suggestion. Self-nomination is explicitly disallowed. Multiple nominations for the same target strengthen the case but do not automatically confer the award.

**Adjudication:** granted either by Moderators through standard review, or through platform competitions (periodic events with specific award categories, run by the platform). Both pathways require human judgment, which is the primary mechanism limiting gamesmanship — a contributor cannot optimize their way to an award via a visible metric, because a person reviews the actual work.

**Explicitly not subject to the "cannot bottleneck on volunteers" constraint** that governs content moderation (Section 1, Section 10.3): nothing breaks or creates liability exposure if award adjudication takes time, unlike content moderation response time.

#### 14.5 Display

A contributor may hold multiple awards (and, per Section 14.2, multiple inherited content-award display rights) simultaneously. They select which single award displays on their profile and in comment threads, giving contributors control over their own platform identity. All awards remain visible on a secondary profile view regardless of which is actively displayed.

#### 14.6 What Awards Explicitly Do Not Do

Awards do not affect search ranking, endorsement weight, or any platform permission. They are recognition, not currency. The AI attestation ranking multiplier (Section 9.4) remains the only mechanism affecting content visibility based on contributor behavior, and it is tied to attestation, not social recognition.

#### 14.7 Implementation Status

**Backend groundwork only for v1.** Schema and structural decisions (multi-target attachment, date-scoped instances, display-right inheritance) are fixed now to avoid later rework, but full nomination/adjudication UI and award activation are deferred (Section 18).

---

---

### 21. Account Status Badges (VE / LNC / FotL)

Three small badges may appear next to an account's name: **VE** (Verified Educator, Section 4), **LNC** (Legible Novelty Certified, Section 4.3), and **FotL** (Friends of the Library, a purely financial-support tier carrying no functional privileges of any kind — not endorsement ability, not visibility, not any platform permission).

#### 21.1 Relationship to the Awards System

These badges are a distinct mechanic from Awards (Section 14) and should not be confused with it. Awards are curated: an account may hold many simultaneously but selects one to actively display (Section 14.5), since award count can accumulate over time and a contributor needs control over their own presented identity. VE, LNC, and FotL are not competing for a display slot; they are independent, simultaneous facts about an account, and **all held badges display at once**, with no selection mechanic.

#### 21.2 Co-occurrence

All three badges may co-occur on the same account. Holding LNC does not require the absence of VE, and vice versa — a Verified Educator who separately completes LNC displays both. FotL is independent of both and reflects only account support status.

#### 21.3 Color and Visual Distinction

Each badge is a distinct color: **VE is green, LNC is blue, FotL is yellow.** This assignment was deliberately chosen over alternatives for two reasons. First, avoiding a red/green pairing — the most common form of color blindness (red-green, affecting roughly 8% of men) would otherwise risk confusing exactly the two badges furthest apart in meaning: the vouched-for professional credential and the purely financial-support badge. Blue/yellow is the standard colorblind-safe substitute pairing. Second, color assignment follows conventional UI expectation: green conventionally signals verified/good-standing and is assigned to VE, the platform's highest-trust, peer-vouched credential; yellow reads as a distinguishing marker rather than a verification signal, a better fit for a support-only badge than green would be.

Each badge also carries its own letters (VE / LNC / FotL) so identification does not depend on color alone — relevant both for the rarer blue/yellow color-vision deficiency (tritanopia, well under 1% of the population) and as a safeguard against any future palette changes.

#### 21.4 Tooltip Behavior and Accessibility

Each badge carries a tooltip disclosing its full meaning, for users who cannot read the small badge letters or do not recognize the acronyms.

**Trigger:** opens on click, or on mouse-hover with a 1-second delay.

**Dismissal — four independent paths, all required:**
- Click anywhere outside the badge/tooltip combined region closes it.
- On the hover-triggered path, moving the mouse off the combined badge-plus-tooltip hitbox closes it. The hitbox must include the rendered tooltip itself, not just the originating badge — otherwise a user moving toward the tooltip to read it more comfortably exits the hitbox first and closes it prematurely, before they can read it.
- Escape closes the tooltip and returns focus to the badge.
- Focus leaving the badge (e.g., Tab) closes the tooltip as part of the normal focus change.

**No close button.** Because the tooltip contains no interactive content, it remains a true informational tooltip (`role="tooltip"`) rather than a popover/disclosure widget, avoiding the additional `aria-expanded` / `aria-controls` state management a close button would require. Escape and focus-loss serve as the keyboard-accessible dismissal paths in its place — without one of these, keyboard-only users would have no way to close the tooltip at all, since both the click-elsewhere and hover-off paths depend on an input modality (a mouse) they aren't using.

**Screen readers:** badge tooltips must be exposed via proper ARIA labeling (`aria-label` or `aria-describedby`), not a bare hover-only implementation (such as an HTML `title` attribute alone), which screen readers announce inconsistently. The badge's letters and color are a sighted-user shortcut; the underlying accessible name must carry the same full meaning (e.g., "Verified Educator") independent of whether the visual tooltip is present.

---

---

## Part V — Communication

### 11. Comments, Big Questions, and the Forum

#### 11.1 Unified Structure

Every published module has its own subforum, consisting of:
- One standing **General Feedback** thread — direct, less-structured feedback to the module's author.
- Multiple **Big Question** threads — one per submitted question (Section 11.3).

There is additionally a **central forum** for platform-level/community discussion not tied to any specific module — author back-and-forth on platform goals, more nuanced than a 400-character commission description allows.

All three thread types (General Feedback, Big Questions, and central forum threads) share one underlying infrastructure: the same eligibility gate, the same author/moderator permission and removal controls, and the same notification triggers. The General Feedback thread specifically is what earlier design language referred to as "the post-publication comment layer" — it was never a separate system from Big Questions, just an unnamed sibling thread type within what is now understood as one module subforum.

#### 11.2 Comment Permissions and the Removal State Machine

**Eligibility:** posting in the General Feedback thread or central forum requires an account meeting the 7-day/completed-profile gate (Section 9.5). New accounts see an onboarding-framed message rather than a rejection. Big Questions submission (not response) does not require this gate — see Section 11.3.

**Author control:** the Module Author can remove any comment on their own module's General Feedback thread at their sole discretion.

**Removal state machine:**

| State | Trigger | Normal users | Author | Moderators | Admins |
|---|---|---|---|---|---|
| Visible | default | see it | see it | see it | see it |
| removed_by_author | author removes | hidden, no stub | hidden | subtle red background; "confirm removal" and "preserve" buttons available | see it |
| preserved_by_moderator | moderator clicks "Preserve" on a removed_by_author comment | hidden, no stub | hidden | yellow background, no further action available, blocks confirmation into removed_by_moderator | see it |
| removed_by_moderator | moderator confirms a removed_by_author comment, or removes directly | hidden, no stub | hidden | findable in database only | see it |
| purged_by_admin | admin purges (doxxing, identifying info, etc.) | visible stub: "This comment was removed by an administrator" (default); full removal optional per-action | same stub | same stub | stub plus full action log with mandatory reason code |

**Why "Preserve" rather than moderator restoration:** unilateral moderator restoration of an author's removal was considered and rejected — it creates a direct, unresolvable conflict between moderator authority and an author's control of their own comment space. "Preserve" instead creates an audit trail (this comment had enough value that a moderator flagged it for record) without forcing the comment back into the author's or community's view, letting moderators track a pattern of suspicious removals over time without overriding author control on any single instance.

**purged_by_admin is the only irrecoverable state** — content is genuinely deleted, not merely hidden. This is the specific tool for doxxing or accidental posting of identifying information, requires a mandatory reason code, and is treated as requiring a confirmation step given its irreversibility.

**Visible stub vs. full disappearance:** a visible stub ("This comment was removed by an administrator") is the default for purged_by_admin, chosen because invisible gaps in a comment thread look confusing or like a transparency failure when later replies reference removed content. Admins retain the option to select full removal (no stub) on a per-action basis for the narrow case where even acknowledging a comment existed creates risk.

**Bulk moderation tooling:** authors can bulk-purge all comments from a specific account on their own module in a couple of clicks. Moderators/admins separately need bulk tooling to remove a banned account's comments across all modules platform-wide, not just the single module where a problem was first noticed.

**Account purge interaction:** a purged user's comments are not deleted when their account is purged. Only the displayed username changes — replaced with the purge-time pseudonymous identifier (Section 2.4), which carries no profile link, making retroactive analysis of a purged user's comment history substantially harder.

#### 11.3 Big Questions

Each Contextualized Module's Big Questions threads function as a structured, publicly archived knowledge layer, not a forum in the casual sense. The name is deliberate: it signals that the question itself is worth preserving, that curiosity is a product of the module rather than a side effect, and that the answer may be open-ended or contested rather than closed — in explicit contrast to "FAQ" (implies a known, simple answer) and "Q&A" (implies a purely transactional exchange).

**Governance philosophy.** Adults can opt into social participation. Children should not need social exposure to access expertise. A learner can read a module, read the archived Big Questions, submit a question, and receive an eventual public answer without creating a public profile or interacting socially. The ratio of learning-to-social-overhead is deliberately kept high.

**Question submission:** any Community Member, or a child sub-account, may submit a question attached to a specific module (the 7-day eligibility gate that applies to General Feedback and the central forum does not apply to Big Question submission specifically, since submitting a single question is a lower-risk action than ongoing comment participation). Submitted questions are visible to the Module Author and Moderators but are not immediately public. A child sub-account may submit a question but cannot participate in the resulting thread afterward (Section 3.2).

**Submission status indicator.** Immediately on submission, the submitter sees an explicit confirmation that their question was received and is awaiting author review — something to the effect of "Submitted — awaiting review." This is a deliberate UX requirement, not a cosmetic nicety: the interval between submission and any author action (Answer, Merge, or Pass to Community, below) could otherwise look identical to a failed or ignored submission from the submitter's side, with no feedback either way. An explicit, predictable status removes that ambiguity, consistent with the platform's broader emphasis on legibility and predictability over leaving a learner to guess at an unexplained silence.

**Module Author review queue actions, per submitted question:**
- **Answer** — leads to the response interface; becomes a public Big Question thread with the author's response as primary content and the triggering question noted.
- **Merge with [existing question]** — **Phase 1: no AI-computed suggestion.** The author manually searches or browses the module's existing Big Questions archive from the review queue to check for a duplicate or closely related question themselves, and selects a match if one exists; the merge/append mechanic itself (below) works identically either way. **Phase 2** adds an AI semantic-similarity pass ahead of this manual step: if similarity exceeds a threshold, the button appears pre-populated with the suggested match, multiple potential matches show as separate buttons, and author merge/no-merge decisions become training signal for threshold tuning over time. In both phases, the author makes the final merge decision — Phase 2 only changes whether a candidate match is suggested to them or found by their own search. Merging appends the new question to the existing thread, collapsed by default, incrementing the append count.
- **Pass to community** — posts the question to the module's General Feedback / subforum space with a note that the author is asking the community to weigh in. This button's primary function is preventing questions from falling through the cracks, not building a social feature: it gives a question a path to an answer when the author doesn't personally know it, or simply hasn't gotten to it. Once passed, the question lives under normal community-moderation rules; the author retains the option to synthesize an official response later but is not obligated to. The original submitter is notified that their question was shared with the community.

**Append mechanic:** when a subsequent learner asks the same or a closely related question, it does not create a duplicate thread — it appends to the existing thread (via the merge mechanism above), collapsed by default. The append count is displayed (e.g., "43 learners asked related questions"), which normalizes confusion for the reader and gives the Module Author signal about where conceptual friction exists in the material.

**Weekly digest unanswered count (Section 16):** distinguishes between questions still sitting in the author's queue (needing an author decision) and questions already passed to community but not yet answered (needing time or community engagement) — these are different states with different responsibilities, even though both count as "unanswered."

**"Do you feel lucky?" feature (planned, deferred — see Section 18):** a button that routes a logged-in community member to a random unanswered Big Question. Greyed out for anonymous visitors (positioned near the login prompt, since answering requires an account). Priority routing: unanswered questions matching the user's listed interest domains, in a language on their profile, always surface first; questions outside listed interests but in a profile language surface once the first pool is exhausted; questions in a language not on the user's profile never surface. If a user is routed to a question outside their listed interests, that result itself communicates that their own interest areas are currently fully answered — no separate "nothing found" message is needed. For anonymous visitors (who cannot answer), this routing question is moot, since the button is unavailable to them entirely.

**Archive as secondary resource.** Over time, a module's Big Questions archive becomes a secondary educational resource in its own right — tracing the conceptual boundaries of the material as actually encountered by learners, potentially more valuable to a future educator assessing a module's enrichment context than the module alone.

**Scope of discussion.** Big Questions are specifically for questions arising from module content, not a general discussion forum; off-topic threads are subject to Moderator removal.

**What Big Questions explicitly avoids:** the Stack Overflow failure mode, where a community optimizes for answerability over curiosity and becomes hostile to broad, speculative, or repeated questions. Big Questions prioritizes curiosity value over answerability, which is why threads remain open-ended and append-friendly rather than closing once "answered."

#### 11.4 Forum Implementation

**Tooling decision: build natively on the existing stack, not a separate forum application.** Discourse (best-in-class open source forum software, but Ruby on Rails — would require maintaining a genuinely separate application stack bridged via SSO) and Flarum (same separate-stack tradeoff, PHP-based) were both considered and rejected as the build target for this reason. NodeBB (Node-native, closer fit) is noted as a fallback worth revisiting only if custom-build forum-specific functionality — search, mentions, read/unread tracking — turns out to be a larger lift than anticipated. The selected approach keeps module subforums, the central forum, and the existing comment infrastructure as one coherent system rather than an integrated-but-separate bolt-on, since the hard infrastructure (permissions, removal states, eligibility gates, notification triggers) is already designed once for the comment system generally.

**Post composition:** TipTap, reused from the module editor rather than building a separate forum-specific text input.

**Visual/UX reference: Discourse**, specifically for continuous/infinite scroll behavior and reply-to hierarchy display. Discourse is retained as a design reference image source even though its codebase was rejected as the build target.

**True nested reply structure:** each post carries a `parent_post_id` (self-referencing) — genuine structural nesting, not a flat list with visual "replying to X" labels. Applies uniformly across the central forum and module subforums alike. **Collapsible downstream replies, Reddit-pattern:** any post can be collapsed, hiding its full reply subtree, with a count shown ("12 replies hidden") and click-to-expand — necessary because true nesting becomes unreadable past a few levels without it. Collapse state is assumed session/local rather than a synced account preference by default.

**Removal-state interaction with nesting:** the existing stub-based removal pattern (Section 11.2) generalizes cleanly to nested threads with no modification needed. A removed parent post leaves a stub in its tree position; its full reply subtree remains intact and readable beneath the stub. Removal never cascades to children.

**Acknowledged risk on UI quality:** TipTap solves post composition and rendering quality, but does not solve thread-list views, pagination, read/unread tracking, search, or overall navigation layout — these remain a frontend design problem requiring deliberate component design (thread card, post bubble, pagination control, badge display) established once, early, rather than re-derived ad hoc per screen. This is flagged specifically because iterative LLM-assisted aesthetic refinement is prone to introducing visual drift rather than convergence across successive prompts when no fixed component reference exists, and locking design primitives early is the mitigation.

---

---

### 20. Community Channels: Subreddit and Central Forum

The r/LegibleNovelty subreddit serves as a pre-launch and public-facing community channel for the Workshop side specifically (authoring, testing, feature discussion). The in-platform central forum (Section 11) is the account-gated version of that same space once the platform is live. The subreddit is not expected to be replaced by the central forum, but its role should narrow toward discovery/overflow for Workshop activity once the forum has meaningful engagement.

The Library side (module reading, Big Questions) has no subreddit analog — it's public and account-free by design, with nothing to discuss access to.

---

---

## Part VI — Notification

### 16. Email and Notifications

**Infrastructure:** Resend, integrated via the Auth.js email adapter (Section 17.2).

**Opt-out:** user-configurable in account settings, granular by category, with related triggers grouped to minimize checkbox count. Some categories (account/security-critical emails) are non-optional.

**Trigger list:**

*Account and authentication:*
- Email verification on signup
- Password reset
- Parent account deletion warning (child accounts attached)
- Child account graduation notification
- Verified Educator status granted or rejected
- Peer token received
- Peer token refreshed

*Content pipeline:*
- Seed Commission fulfilled (automated, prompts the original commissioner toward posting a Module Commission)
- Module Commission fulfilled
- Educator endorsement received on your seed or module
- Your seed or module placed in Moderation Hold
- Your seed or module cleared from Moderation Hold
- A comment submitted on your module (Section 11.2)

*Community and social:*
- Big Questions response posted to your submitted question
- Your Big Question passed to community by the module author
- Award nominated
- Award granted
- Commission you follow has been fulfilled
- Commission you follow has been reopened

**Weekly digest** (single grouped email, not a series of individual emails):
- For Module Authors: new completions per module, new downloads, new recommendations, new endorsements, new Big Questions submitted, new comments submitted, count of unanswered Big Questions (broken down: in author's queue vs. passed to community but unanswered, per Section 11.3)
- For Seed Architects: new modules built on their seeds, new endorsements on their seeds, completed modules built on their seeds (aggregate), new commissions on their seeds
- For both roles: awards activity
- Timing: fixed day weekly (Monday, user's local timezone)
- Empty weeks: digest is suppressed entirely — no "no new activity" email is sent
- Child sub-accounts do not receive the weekly digest, or any other email contact, consistent with the platform's general avoidance of unnecessary direct contact with minors

---

---

## Part VII — Infrastructure

### 17. Infrastructure and Stack

#### 17.1 Hosting

- **Application server:** Hetzner VPS, Helsinki data center preferred for global latency distribution. This choice was explicitly reconsidered after recognizing that the platform's seed/module structure makes localization (a Japanese-language module built from a translated seed, for instance) a natural, community-driven outcome rather than a platform feature to build — meaning the user base is inherently global from day one, which made server-location latency a relevant consideration rather than a US-only assumption.
- **Database:** Hetzner managed PostgreSQL. UTF-8 encoding from day one, since non-Latin scripts will appear in module content from launch regardless of UI language.
- **Reverse proxy:** Nginx.
- **Process management:** PM2.
- Domains `legiblenovelty.org` (canonical, public-facing) and `legiblenovelty.com` (registered defensively, redirects to `.org`) are both held.

No AWS/GCP/Azure — pricing model complexity and overhead judged unwarranted at this platform's scale and donation-funded budget.

#### 17.2 Authentication

Auth.js, self-hosted, with **database sessions** (not JWT) — database sessions were specifically required because they're revocable, which the account-deletion and parent/child access-revocation flows (Section 3) depend on; JWTs are harder to invalidate on demand.

**Session store: PostgreSQL for v1, with a deliberate path open to Redis later.** A Redis-backed session store was considered and deferred, not rejected — at launch scale, PostgreSQL session lookups are a simple indexed query and not expected to be a meaningful bottleneck, while Redis would add a second piece of infrastructure to operate on a self-hosted, single-maintainer setup before there's evidence it's needed. This is treated as a scaling response to a measured problem, not a precondition. To keep the later migration clean if session-table read load does become a real bottleneck, session handling should go through Auth.js's standard session adapter pattern rather than custom-rolled session logic — Auth.js supports a Redis-backed session adapter directly, so the swap remains low-cost specifically because this constraint was respected during the build.

#### 17.3 Editor and Content Tooling

**TipTap**, selected over Quill (simpler but less extensible) and raw ProseMirror (maximum control, significantly more build effort) specifically for its extension model, which is how fillable-field custom node types (Section 7.2) and forum post composition (Section 11.4) both get implemented using one tool rather than two. Status: provisional, with a fuller review planned before Claude Code build work begins, though the core decision is not expected to change.

#### 17.4 Email Service

**Resend** — selected over Sendgrid (free tier too restrictive at 100/day) and Postmark (small free tier) for its generous free tier (3,000 emails/month), documentation quality, and first-class Auth.js adapter.

#### 17.5 Educator Verification Lookup Table

A maintained, editable lookup table (in platform administration, not hardcoded) of teacher registry URLs by jurisdiction, referenced by the AI pre-screening pass during Verified Educator manual review (Section 4.1). One-time research task to compile, with occasional maintenance as URLs change.

#### 17.6 Inference Infrastructure

Self-hosted, on the Andromeda rig: dual ASRock Arc Pro B60 (48GB VRAM total), Fedora, IPEX-LLM as the inference backend (preferred over the llama.cpp SYCL path for Arc GPU workloads). **Currently CANDOR Phase 2 research infrastructure only** (LoRA fine-tuning, expanded benchmarks).

#### 17.7 Repository and License

GitHub: `github.com/NovelSystems/LegibleNovelty`. Private visibility. **License: AGPL-3.0** — selected specifically to close the "SaaS loophole": anyone running a modified version of the platform as a hosted service must also open-source their modifications, preventing a commercial entity from forking the codebase into a closed competitor to a donation-funded public good platform.

---

---

### 8. Pre-Publication Review — DEF Arbitration Marked Phase 2 / Future Work

**The DEF Arbitration mechanism described in this section (Sections 8.1–8.2, 8.4–8.6) is Phase 2 / future work, not v1 scope.** It requires real prompt, rubric, and model-configuration design (the actual gap identified before this reorganization began) and is deferred rather than built now.

**Open question this deferral creates, not yet resolved:** Section 8.3's two hard-error checks (Commission alignment, Seed alignment) are described as blocking publication, distinct from the advisory Justice report (Section 8.6). If those checks can be implemented as simple, deterministic rule checks against structured seed/commission data rather than requiring DEF's multi-agent debate machinery, they could plausibly ship in v1 on their own, with v1 otherwise having no automated pre-publication review at all, relying on ordinary community-correction and report-driven moderation (Section 10) until Phase 2 lands. Whether that's the right interim posture, or whether the hard-error checks should also wait for Phase 2, is not yet decided.

When an author initiates the publish action (for any module, regardless of authoring path), a DEF-arbitration-based review runs before publication completes, once this section's Phase 2 work is built.

#### 8.1 Why DEF Arbitration, Not a Single Reviewer

A single LLM reviewer is structurally pulled toward pleasing two competing principals simultaneously: the module author (who wants validation) and whoever instructed the review (who wants a thorough critique). This is a direct instance of the sycophancy problem CANDOR / DEF Arbitration was built to address, and this review is treated as an early real-world application of DEF outside the CANDOR research context — the resulting review corpus is noted as a potential future dataset for CANDOR Phase 2.

#### 8.2 Review Structure

- An **advocate** debater argues the module succeeds on Legible Novelty metrics (contextual immersion, recoverability, signaled, bounded), citing specific passages.
- A **critic** debater argues the module falls short on the same metrics, citing specific passages.
- A **Justice synthesizer**, reading both arguments blind to which is advocate and which is critic, produces a structured prose report — explicitly **no numerical score** — naming specific strengths and weaknesses with textual evidence drawn from the module itself.

#### 8.3 Additional Checks in the Same Pass

- **Commission alignment check:** if a commission is attached, the review checks module content against the commission's description and throws a specific, actionable error if they don't match — protecting commission creators from irrelevant fulfillments without requiring them to police submissions manually.
- **Seed alignment check:** if the seed reference was changed on an existing module (Section 5.5), throws an error if the content doesn't satisfy the new seed's constraints.

These two checks are **hard errors** that block publication. The Justice report itself is advisory only (Section 8.5).

#### 8.4 Workflow

Author initiates publish → DEF review runs → Justice report (plus any hard errors) presented to the author → author may return to editing or proceed to publish → on publish, report text is stored in module metadata, version-locked to that specific module version → the report regenerates and re-stores on any subsequent version increment.

**Author-facing only, for now.** The report is not shown to endorsing educators, pending confidence that review quality won't poison endorsement decisions with a weak or sycophantic assessment. This is explicitly a v1 caution to be revisited once quality is established, not a permanent architectural decision.

#### 8.5 Quality Monitoring

A binary Helpful / Not Helpful flag is shown to the author after they read the report, captured alongside the report text, module version, and the author's subsequent action (returned to editing vs. proceeded to publish). The resulting 2×2 signal — helpful/not-helpful crossed with edited/published — is the primary quality evaluation framework for the reviewer, correlated against eventual endorsement outcomes over time. No separate evaluation pipeline is needed. A "Helpful + returned to editing" rating on a critical review is the strongest available validation that the system is doing real work rather than simply telling authors what they want to hear.

#### 8.6 Publication Gate

Advisory only, except for the two hard errors in Section 8.3. No minimum Justice-report outcome blocks publication on its own. This is consistent with the broader platform principle (Section 1) that moderation, not AI review, is the only rejection mechanism for content that has already cleared these specific structural checks.

---

---

## Part VIII — Payments and Billing

### 23. Payments and Billing

**Payment processor: Stripe**, chosen for native support of both one-time and recurring payment models in a single integration, its Checkout and Billing Portal components (reducing custom UI otherwise needed for payment forms, subscription management, and cancellation), and webhook support for the event-driven confirmations this system depends on — a payment clearing needs to reliably trigger a downstream action in another subsystem, most notably unlocking Certification Center's LNC course.

**Four distinct flows, each with different mechanics — this is not one generic "payment system" but four:**

1. **FotL (Friends of the Library) — recurring subscription.** A Stripe Billing subscription object; purely a badge/display flag on the account (Section 21), no functional feature gate of any kind attached to it.
   - **Open question:** payment-failure handling. Stripe's built-in retry logic (Smart Retries) can attempt recovery automatically before a subscription is marked past-due or canceled. Does the FotL badge disappear the moment a renewal first fails, or only once retries are exhausted and the subscription is fully canceled? Not yet decided.

2. **LNC training — one-time payment, gates course access.** Payment must clear before Certification Center's course content unlocks (the cross-system dependency already on record above). This is a one-time unlock of course *access*, not a per-attempt charge — the certification test itself remains free and unlimited-retry once the course has been purchased (Section 4.3).

3. **Sponsored commission visibility — one-time payment, time-boxed boost.**
   - **Open question:** does sponsorship purchase a fixed boost *duration* (e.g., 30 days of elevated visibility, requiring expiration/renewal logic), or a flat boost that lasts until the commission is fulfilled (requiring no expiration logic at all, just a flag cleared on fulfillment)? Not yet decided.

4. **Institutional licensing — deferred, invoicing model.** Not yet built. When it is, it's likely a genuinely different mechanism from the three flows above: invoiced, annual-contract billing rather than Stripe Checkout, possibly requiring a separate accounts-receivable process rather than card-present payment.

**Refunds:** not yet specified for any flow. Open question.

**Receipts and tax handling:** Stripe generates receipts natively; sales tax/VAT collection (Stripe Tax or equivalent) is a business and legal configuration decision rather than a build-blocking technical one, flagged here rather than resolved.

---

## Other

### 1. Design Principles

**Module reading is unconditionally public.** No account is required to access any published module or Big Questions archive. This is a non-negotiable design constraint: a learner who needs these materials should never be blocked from them by a parent's inaction, institutional access, or account friction. This principle holds even if future stakeholders propose requiring login for analytics or engagement reasons.

**Educators are collaborative curators, not gatekeepers.** Verified Educator endorsement is a positive signal ("I looked at this and vouch for it"), not an approval gate. No seed or module requires endorsement to publish or to be read. This framing must be established explicitly in educator onboarding before an account ever sees an endorsement button.

**The platform cannot bottleneck on volunteer moderator availability.** Moderators are unpaid volunteers. Systems that require mandatory human review before publication, or that depend on moderator response time for basic function, are not viable at this platform's scale. AI screening plus low-friction community reporting substitute for mandatory pre-publication human review (see Section 8 and Section 10) — **in Phase 2, once AI screening exists (Section 22's all-AI-is-Phase-2 scope decision). Phase 1 has no automated pre-publication review of any kind; the substitute for mandatory human review in Phase 1 is author attestation plus low-friction community reporting alone (Section 10), a narrower and, if anything, easier posture to evaluate for liability purposes than the AI-gated version this section otherwise describes.**

**Data minimization, especially for minors.** The platform collects the minimum data necessary to function. Anonymous reading requires nothing. Logged-in accounts store only what a specific feature needs. This principle directly shapes the account, progress, and comment systems throughout this document.

**No private messaging, with one narrow, deliberate exception.** The platform has no general direct-messaging system, for any account, at any age. This is a platform-wide rule chosen specifically for simplicity and child safety: rather than attempting to correctly distinguish which conversations involve a minor and gate only those, every private real-time channel is simply absent. The single exception is the Share Contact Information action (Section 12.3), narrowly scoped to mutually Connected adult (18+) accounts, which exists to prevent the platform from becoming a lock-in trap for adult collaborators who want to take a working relationship elsewhere. This exception does not reopen general messaging; it is a single bounded action, not a conversation channel. **The honest threat model:** the platform cannot prevent a minor from lying about their age at signup, and does not claim to. The protective value of the no-DM rule, combined with age-gating the one contact-sharing action that exists, is that any attempt to push a minor toward private off-platform contact must happen through visible, auditable public activity rather than a private channel invisible to moderators and the community. This reduces opportunity and increases visibility; it does not make age verification airtight, and no claim to the contrary should appear in user-facing documentation.

---

---

### 18. Planned Features (Deferred from v1)

Confirmed as planned, but intentionally not built in the first version:

1. **Curriculum map view** — visual taxonomy with coverage indicators (Section 6.4). Backend query support (coverage, gap, density, language coverage) must exist from day one even though the visualization itself is deferred.
2. **"Do you feel lucky?"** random unanswered Big Question routing (Section 11.3).
3. **Named filter presets** (e.g., one-click "Endorsed + Weighted Approval" state) (Section 9.5).
4. **Optional "notes for educators" field** per question, print-only, never shown in the web viewer (Section 7.3).
5. **Country-specific grade-increment dates** — v1 ships with a single configurable date (default mid-August); per-country logic deferred (Section 3.2).
6. **News feed preview for anonymous visitors**, as an account-creation conversion prompt.
7. **Flair tag upload/template system** — schema field reserved now (`flair_tags`), full implementation deferred (Section 5.3).
8. **Full Awards nomination/adjudication UI and activation** — backend schema only for v1 (Section 14.7).
9. **News feed** itself (chronological, interest-domain-filtered activity stream for logged-in users) — described in design discussion but not yet built; surfaces new modules, endorsements, recently answered Big Questions, and active community discussions within a user's interest domains, explicitly excluding individual corrections/recommendations and moderation activity to avoid noise.

---

---

### 19. Cross-References to Book Manuscript

The Learning Seed / Contextualized Module vocabulary, and the rationale for the Seed Architect and Module Author naming, is documented in *Legible Novelty*, Chapter 11 ("Designing for Legible Novelty"). The citation-style incentive for Seed Architects and the recognition-based incentive for Module Authors, along with the pseudonym/disclosure rationale (Section 2.3), should remain consistent with that chapter's framing if either document is revised independently.

---

---

### 22. High-Level System Map (Subsystem Assignment)

This section records the subsystem boundaries agreed on for the Claude Code build handoff. **It is a categorization reference only — existing section numbers and structure elsewhere in this document are unchanged; this is not a reorganization.** A future pass may restructure the document to physically group content by subsystem; until then, this section is the authoritative map of which existing section belongs to which subsystem.

**Eight subsystems:**

1. **Library** — content access and interaction, not creation. Module browse/search/reading (Sections 5, 7, 9.6, 9.7), the homepage module list (9.6), Big Questions **reading/archive only** (the public-facing half of Section 11.1), and **Endorsement and Community Recommendation** (Sections 9.1–9.2 — using earned status to interact with existing content is not content generation or modification, even though it requires an account and, for Endorsement, VE/LNC status specifically). Library is no longer strictly "account-free"; the boundary is content interaction versus content production, not login status.
2. **Workshop** — content generation and modification only. Seeds and Modules authoring (Sections 5, 7). A Verified Educator who only endorses never needs to touch Workshop at all — endorsing lives in Library, not here.
3. **Certification Center** — a mini-LMS, scoped specifically to **Sections 4.3 (LNC) and 4.4 (VE framework onboarding) only.** Content delivery, progress tracking, assessment, and pass/fail determination, handing an authorized outcome to User Management rather than holding account state itself. Depends on Payments & Billing (Section 23 — LNC's training payment must clear before its course and test unlock).
4. **User Management** — account state and identity. Account Lifecycle (Section 3: date of birth, child sub-accounts, purge, reclaim), Connections (Sections 12.2–12.3), Verified Educator verification paths and peer-token accountability (Sections 4.1–4.2 — evaluation and accountability logic with no content-delivery shape, and so not part of the mini-LMS), the resulting VE/LNC account flags themselves, and Account Status Badges (Section 21), which display that state.
5. **Communication** — Forum (Section 11.4), Module Comments (Sections 11.2–11.3), Big Questions **submission/append/participation only** (the account-gated half of Section 11.1 — reading stays Library).
6. **Notification** — Section 16 (email and in-app notifications, including the weekly digest). Kept separate from Communication as push/alert infrastructure rather than social content.
7. **Infrastructure** — Section 17 (hosting, auth session mechanics, editor tooling, inference infrastructure, repository and license) and Section 8 (DEF Arbitration pre-publication review pipeline).
8. **Payments & Billing** — Section 23. FotL recurring subscriptions, LNC training one-time payments, sponsored-commission visibility payments, and (future) institutional licensing invoicing.

**Explicit design decision, not an oversight: Trust & Safety is deliberately distributed, not a standalone subsystem.** Its pieces (Section 10's content-quality moderation, comment/forum moderation, Section 4.2's peer-token accountability) are assigned to whichever subsystem they substantively belong to (Workshop, Communication, User Management respectively) rather than centralized, since no single owning concern justified pulling them out of context.

**All four items originally flagged here are now resolved.** Lesson Plans (Section 12.1) moved to Part I (Library) — curating existing modules is content interaction, not generation, and this directly serves the principle that a Verified Educator who only assigns lesson plans shouldn't need to be a Workshop user. Awards (Section 14) moved to Part IV (User Management) — nominating or displaying a badge recognizes a contributor's identity, it doesn't touch content at all. Quality Control and Moderation (Section 10) and Commission Marketplace (Section 13) both settled in Part II (Workshop): review is inseparable from the authoring pipeline it gates, and the marketplace exists as a whole to drive content creation, posting and browsing included, not just fulfillment.

**Explicit scope decision: no AI functionality of any kind ships in Phase 1, not only the hardware-dependent features.** DEF Arbitration (Section 8) was already Phase 2 for compute/hardware reasons. This decision extends the same boundary to two lighter-weight AI touchpoints that don't themselves require new hardware: Verified Educator verification's AI-assisted directory lookup and document screening (Section 4.1), and Big Questions' AI-computed merge-suggestion (Section 11.3). Both ship in Phase 1 as fully manual processes with the same end-user-facing outcome (an application gets reviewed; a question can still be merged), the AI layer added on top in Phase 2 narrows the human workload rather than changing what the feature does. Phase 1 therefore has zero automated review or screening anywhere on the platform.

**Cross-system dependency worth flagging as a real boundary, not an implementation detail:** Certification Center's LNC path cannot proceed past payment without Payments & Billing (Section 23) clearing first — a mid-flow dependency, not a clean one-directional pipeline.

**Not on this map at all:** the r/LegibleNovelty subreddit (Section 20) is an external community the platform doesn't build or host, deliberately excluded from a map meant to represent what's actually being built.

---
