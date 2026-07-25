# Legible Novelty — Stage 1: User Management

**Task brief for Claude Code.** Stage 1 builds on the Stage 0 substrate (Docker Compose, dockerized Postgres, Prisma with shadow database, Auth.js session adapter, Mailpit) and replaces the placeholder/test user model with the platform's real Account schema, plus the logic that owns account state and identity. This maps to subsystem 4 ("User Management") in the master design doc's Section 22 system map.

---

## Scope

**In scope for Stage 1, right now:**
- Account schema, complete (all fields, including ones only *populated* by subsystems built in later stages)
- Core authentication flows: signup, login, logout, password reset, email verification
- Account lifecycle logic: date-of-birth collection, child sub-accounts, automatic graduation, parent dormancy/deletion handling, deactivation, purge, reclaim, display name toggle and reuse blocking
- Connection schema and logic
- ParentApproval schema and logic (one-time pass vs. standing connection)
- Share Contact Information (the one bounded exception to the no-messaging rule)
- Verified Educator verification, Phase 1 manual-only (Section 4.1), backed by a real `VerificationApplication` schema (Path 1) and `TokenGrant` schema (Path 2) — neither existed in any prior document
- Peer token accountability (Section 4.2), backed by a real `AccountFlag` schema
- Account Status Badges display (Section 21)
- Awards backend only: `AwardCategory`, `AwardInstance`, `AwardNomination` schema, with no nomination UI, no adjudication workflow, no display-selection UI, and no frontend surface of any kind
- Account/authentication email notifications (Section 16's first trigger category), delivered through Stage 0's Auth.js/Resend adapter (Mailpit in dev) — this is email infrastructure Stage 0 already built, not the separate in-app Notification subsystem

**Explicitly deferred — not this stage:**
- Awards frontend and business logic: nomination submission, adjudication queue, category administration, display-badge selection. The tables exist; nothing reads or writes to them from a user-facing surface yet.
- AI-assisted VE screening (directory-lookup automation, document pre-screening) — Phase 2 platform-wide, per Section 22's no-AI-in-Phase-1 decision. Capture rejection reason codes now regardless (Task 6) since that data has value the moment Phase 2 needs a training signal, and costs nothing to log from day one.
- Certification Center (Sections 4.3 LNC, 4.4 VE-framework onboarding) — a separate subsystem with its own Payments & Billing dependency. `lnc_status` and `veframework_onboarding_passed` exist as Account columns (Task 1) but nothing sets them yet.
- Payments & Billing (Section 23) — separate subsystem/stage. `fotl_status` exists as an Account column but nothing sets it yet.
- The in-app Notification subsystem (Section 16's content-pipeline and community/social trigger categories, and the weekly digest) — everything beyond the seven account/authentication triggers listed in Task 10 stays deferred to Notification's own stage.
- The shared `Post`/`Comment` model and its `thread_type` polymorphism (Communication subsystem). The VE token-request subforum needs a place to live now regardless — see Task 6's `TokenRequestThread` decision below, which is a deliberate, temporary stand-in for this, not an early start on Communication.
- `LessonPlan` and `LessonPlanAssignment` (Workshop subsystem). Connection and ParentApproval are built now against a use case (lesson plan assignment) that can't actually be exercised until Workshop ships — see Task 4's soft-reference handling of this.
- Every other subsystem's own tables: `LearningSeed`, `ContextualizedModule`, `BigQuestion`, `Commission`, `Taxonomy`, `Endorsement`, `CommunityRecommendation`, `ProgressArchive`. These belong to Library, Workshop, and other subsystems — not User Management — and several have genuinely unresolved schema questions (see the Data Model doc's "Genuine Gaps" section) that make them premature to build regardless of subsystem ownership.
- `veframework_onboarding_passed`'s actual gating *mechanism* (quiz vs. completion, and sequencing relative to Section 4.1) — the column exists as a placeholder boolean; the mechanism that will someday set it is undecided and out of scope here.
- The grade auto-increment scheduling mechanism — genuinely unresolved, see Open Items. Do not silently pick an implementation for this.

---

## Tasks

### 1. Account schema

Full model, all fields real (not placeholder):

| Field | Type | Notes |
|---|---|---|
| `account_id` | UUID/PK | Retained in the clear even post-purge |
| `role` | enum: Community_Member / Verified_Educator / Moderator / System_Admin | Mutually exclusive. Moderator/System_Admin assignment is manual/DB-only in Stage 1 — no admin UI exists yet, and that's a stated limitation, not an oversight. |
| `date_of_birth` | date | Required at creation for every account, retained for account lifetime |
| `is_child_subaccount` | boolean | |
| `parent_account_id` | UUID/FK, nullable | Set only for child sub-accounts |
| `grade` | enum or int | Stored separately from DOB; auto-increments mid-August annually — see Open Items for the unresolved scheduling question |
| `country` | string | Used in child public identity display: "A [grade] learner from [Country]" |
| `preferred_display_name` | string, nullable | |
| `legal_name` | string | |
| `display_name_use_preferred` | boolean | Toggle controlling which name is shown publicly |
| `display_name_hash` | string, nullable, **indexed** | Blocks reuse of a purged account's old handle platform-wide — checked on *every* display name assignment, not only reclaim (Task 3) |
| `purged_pseudonymous_identifier` | string, nullable | Generated at purge time, not account creation; opaque, not derivable from account ID or email |
| `email_hash` | string, nullable, **indexed** | Retained post-purge, irreversible, reclaim-flow lookup — hit on every signup and reclaim attempt, needs the index from day one |
| `password_hash` | string, nullable | Retained post-purge, irreversible, reclaim-flow use only |
| `account_status` | enum: active / deactivated / purged | |
| `deactivated_at` | timestamp, nullable | A consistent soft-delete timestamp convention, established here so `ProgressArchive` and the comment-attribution swap can follow the same pattern in later stages rather than each inventing its own |
| `purged_at` | timestamp, nullable | Same rationale as above |
| `language_preference` | string or array | Used for Big Questions priority routing and homepage/search defaults once those subsystems exist; unused by anything Stage 1 builds |
| `interest_domains` | array | Referenced by other subsystems' routing logic once built; unused by anything Stage 1 builds |
| `ve_status` | boolean/derived | Set by Task 6's verification flow (this stage); corrected to false automatically if Task 7 confirms a `bad_peer_token_grant` against the grant that produced it; can also be manually revoked by a Moderator following a confirmed `ve_conduct_review` (Task 7) |
| `ve_granted_by_account_id` | UUID/FK, nullable, self-referential | Set only when VE status was granted via peer token (Path 2); null for Path 1 grants (institutional email/directory) and for non-VE accounts. This is a convenience pointer for display/lookup — the actual system of record for accountability review is the `TokenGrant` table (Task 6), which can hold full history if a person is ever granted, revoked, and re-granted over time. Don't treat this field as the only source of truth for Task 7's Moderator review. |
| `ve_token_available` | boolean | Every VE holds exactly 1 at a time; refreshes 1 month after use |
| `lnc_status` | boolean | Column only — nothing sets this until Certification Center (later stage) |
| `fotl_status` | boolean | Column only — nothing sets this until Payments & Billing (later stage) |
| `veframework_onboarding_passed` | boolean | Placeholder gate, mechanism undecided, out of scope this stage |

**Derived, not stored directly** (computed at read time, not schema columns):
- Seed Architect: has ≥1 Learning Seed with an educator endorsement
- Module Author: has ≥1 Contextualized Module with an educator endorsement on its primary seed

Both depend on tables Stage 1 doesn't build (`LearningSeed`, `ContextualizedModule`, `Endorsement`). Note as a known future read-path against Account so nothing here forecloses it.

### 2. Core authentication flows

**Worth calling out explicitly rather than assuming Stage 0's session-adapter proof-of-concept covers it.** Stage 0 proved Auth.js could create and revoke a database-backed session against a placeholder user; Stage 1 is where the actual account creation and login experience gets built for real, on top of the real Account schema above:

- Signup: email + password, date of birth collection (Task 3), triggers the email verification flow (Task 10).
- Login / logout, against database sessions (not JWT), matching Stage 0's Auth.js configuration.
- Password reset: standard forgot-password flow for any active (non-purged) account. The reclaim flow's own documentation ("there is no password-reset path for a purged account") only makes sense if this ordinary path exists and works for everyone else — build it as the baseline this exception is contrasted against.
- Email verification on signup, using Stage 0's Mailpit-backed Auth.js email adapter in dev, Resend in production.

### 3. Account lifecycle logic

- **Date of birth (3.1):** required at creation, every account, no exceptions. Drives child-account graduation while a minor; gates the 18+ Share Contact Information action once an adult.
- **Child sub-accounts (3.2):** real database record, not a bolt-on type. Birthdate stored, never displayed. Grade auto-increments mid-August annually (single configurable date; country-specific adjustment explicitly deferred, Section 18; scheduling mechanism itself unresolved, see Open Items). Public identity display is "A [grade] learner from [Country]" — no name, no exact age.
- **Graduation (3.3):** automatic, driven by stored birthdate, at the 13th birthday. Not grade-driven. Triggers the graduation notification (Task 10). A graduated 13-17 account remains ineligible for any 18+-gated feature; each feature checks DOB directly, not graduation status.
- **Parent dormancy and deletion (3.4):** dormant parent accounts require no action, child continues functioning normally. On parent account deletion, a warning gate informs the parent that attached child accounts become inaccessible for new logins until the child's 13th birthday (this warning is also one of Task 10's email triggers). A child attempting login after parent deletion sees an explanation and a button to purge their own account immediately rather than wait. During this holding state the child can still read all modules anonymously.
- **Deactivation vs. purge (3.5):** two distinct operations, tracked via `account_status` plus the new `deactivated_at`/`purged_at` timestamps (Task 1). Deactivation suspends the account, all data intact, fully reactivatable. Purge deletes/overwrites PII, retains the account shell for referential integrity, with a reclaim path rather than a plaintext tombstone.
  - **Deleted entirely on purge:** profile info, country, grade, optional profile fields, date of birth, progress archive, language preferences, plaintext display name (replaced by the generated pseudonymous identifier), plaintext email and password.
  - **Retained hashed only:** email hash and password hash (reclaim-flow use only, not reversible, not a usable login credential on their own), display name hash (blocks reuse only, not part of reclaim auth).
  - **Retained in the clear:** account ID, generated pseudonymous identifier, system-generated content (attribution updates to the pseudonymous identifier; content itself is not deleted), child account associations, correction/comment history records.
  - **No email tombstone, no automatic block on future account creation** with the same email.
  - **Reclaim flow:** attempted signup/login with an email matching a purged account's stored hash triggers a reclaim prompt. Old password submitted → hash match required → verification email sent to the entered address → link click proves current control → on success, login restored, person prompted for a new display name and current date of birth. Password mismatch → reclaim fails, told they may create a new account instead. No password-reset path exists for a purged account (contrast with Task 2's ordinary path).
  - **Reclaim does not restore pre-purge identity to old content** — that content stays attributed to the purge-time pseudonymous identifier unless separately re-linked later, which is not an automatic part of reclaim.
  - **Display name reuse prevention — platform-wide, not just at reclaim.** The purged account's original display name is hashed and permanently blocked from reuse. **Every** display name assignment anywhere on the platform — new signup, an existing account changing its name, or reclaim — must check the submitted name's hash against every stored `display_name_hash` before accepting it.
- **COPPA/FERPA posture (3.6):** the parent-creates-account-and-grants-child-access model is the compliance mechanism for under-13 creation, not a checkbox. No data is collected from anonymous visitors of any age. This section is a constraint the above logic must satisfy, not separate build work.

### 4. Connection and ParentApproval schema and logic

**Built ahead of its own use case, on purpose — worth stating plainly.** Connection and ParentApproval exist to support lesson plan assignment, but `LessonPlan` itself doesn't exist until Workshop ships. That means this task is schema- and API-level correct but can't be exercised end-to-end with real content yet. Tests should use a stubbed/mock target reference rather than waiting on a real `LessonPlan` row.

**Connection** (Section 12.2):

| Field | Type | Notes |
|---|---|---|
| `connection_id` | UUID/PK | |
| `account_a_id` | UUID/FK | |
| `account_b_id` | UUID/FK | |
| `status` | enum: requested / accepted | Never auto-forms except the one invite-link exception |
| `created_via` | enum: request / invite_link_autoaccept | |

A Connection is always "standing" and exists solely to grant eligibility for direct, un-gated lesson plan assignment going forward. It is not a social or messaging feature.

- **Adult-to-adult:** requires either an existing Connection, or a raw (non-public) email address as the targeting mechanism for a one-off assignment. No Connection auto-forms from a successful email-based assignment.
- **Adult-to-child, two distinct pathways**, each with its own ParentApproval type:
  1. **One-time assignment pass:** invite to one specific lesson plan → parent approval → access to that single assignment only → no standing Connection created.
  2. **Standing Connection:** separate request type, also requires parent approval. Once approved, future assignments don't need re-approval.
- **Invite-link auto-acceptance (the one exception to "Connections never auto-form"):** following an invite link tied to a specific lesson plan assignment, when it leads to new account creation, auto-accepts that assignment and auto-establishes a Connection with the assigner. **This entire mechanic is inert until `LessonPlan` exists** — build the schema and logic path, but there's nothing to actually link to yet.

**ParentApproval** (Section 12.2):

| Field | Type | Notes |
|---|---|---|
| `approval_id` | UUID/PK | |
| `child_account_id` | UUID/FK | |
| `requesting_adult_account_id` | UUID/FK | |
| `approval_type` | enum: one_time_pass / standing_connection | **Must be visually and functionally distinct in the parent UI — child-safety requirement, not a UX nicety** |
| `lesson_plan_id` | UUID, **soft reference, not an enforced FK** | `LessonPlan` doesn't exist yet. Store as a plain UUID column now; add the real foreign-key constraint via a later migration once Workshop ships `LessonPlan`. Set only for `one_time_pass`. |
| `status` | enum: pending / approved / denied | |

The distinct-UI requirement is worth flagging again in implementation terms: a parent must not be able to mistake "approve this one lesson plan" for "grant this person standing access to my child." This needs enforcement at the interface layer, not just the schema layer.

### 5. Share Contact Information (Section 12.3)

A single bounded action, not a messaging channel — do not build or describe it as a DM system.

- Available only between two accounts with an existing, mutually-accepted Connection.
- Available only between two accounts both 18 or older, per stored date of birth. The action does not appear at all on any account belonging to someone 17 or under, including a graduated 13-17 standard account.
- The only exception to the platform-wide no-private-messaging rule. Not a precedent for general messaging later.

### 6. Verified Educator verification — Phase 1 manual only (Section 4.1)

**This task has real backing schema.** Neither the master design doc nor the Data Model doc ever specified tables for VE applications or token grants, despite describing a full workflow that needs them. Two entities close that gap:

**`VerificationApplication`** (Path 1 — institutional email/directory, and license-holder document review):

| Field | Type | Notes |
|---|---|---|
| `application_id` | UUID/PK | |
| `applicant_account_id` | UUID/FK | |
| `path` | enum: k12_professor / license_holder | |
| `status` | enum: pending / approved / rejected | |
| `reviewer_account_id` | UUID/FK, nullable | The Moderator/reviewer who made the call |
| `rejection_reason_code` | string, nullable | Captured on every rejection, every path, regardless of Phase 1/2 — this is the training signal Phase 2's AI screening will eventually need, and costs nothing to log now |
| `submitted_document_ref` | string, nullable | License-holder path only |
| `directory_lookup_confirmed` | boolean, nullable | Set by the human reviewer checking the institutional directory |
| `created_at` / `decided_at` | timestamp | |

**`TokenGrant`** (Path 2 — peer token):

| Field | Type | Notes |
|---|---|---|
| `grant_id` | UUID/PK | |
| `granting_account_id` | UUID/FK | The Verified Educator who granted the token |
| `recipient_account_id` | UUID/FK | Also written to `Account.ve_granted_by_account_id` on the recipient at grant time |
| `granted_at` | timestamp | |
| `refreshed_at` | timestamp, nullable | 1 month after use, per the token refresh rule |

Path detail:

- **K-12 teachers and professors:** no document upload. Every application routes to a human reviewer, who checks the applicant's institution against its public faculty/staff or institutional directory and confirms the name appears there. If confirmed, a verification email with a confirm link goes to the institutional address (Task 10). The maintained state/jurisdiction teacher registry lookup table (Section 17.4) is available to the reviewer as a manual reference.
- **Teaching credential/license holders without an institutional email path:** the one credential type with an actual document-upload and human-review path, because it has a real external verification mechanism (a state licensing board registry). Reviewer performs document-consistency screening and manually checks the relevant jurisdiction's registry.
- **Explicitly excluded from the document-upload surface:** proof-of-employment documents and graduate enrollment letters. Neither has an external source of truth to check against.

**Peer token (fallback for credentialed educators with no searchable directory; primary and only path for graduate students):**
- Every Verified Educator account holds 1 token at a time, grantable to another account to immediately confer VE status and populate `TokenGrant`. A used token refreshes after 1 month.
- **Token-request subforum — needs a decision, not an assumption.** The design doc's Communication subsystem models this kind of threaded content via `Post`/`Comment` with a `thread_type` discriminator, which is the obvious long-term home. But `Post` doesn't exist yet (Communication is deferred). **Decision for this brief: a narrow, purpose-built `TokenRequestThread` table now** (thread_id, applicant_account_id, rationale text, created_at, auto-posted-publicly semantics per the design doc), explicitly flagged as provisional — to be consolidated into the shared `Post`/`thread_type` model once Communication ships, rather than treated as a permanent parallel system. A Community Member applies to view the subforum; the rationale auto-posts publicly as a new thread at the moment of application. The applicant has no subforum access until a token is granted — no browsing other threads, no back-and-forth before the decision. Reviewer either grants (rationale sufficient) or takes no action (rationale insufficient). Applicant is notified when a token is granted (Task 10).
- Both paths, once granted, produce identical VE status with no visible distinction in badge or permissions.

### 7. Peer token accountability and VE status review (Section 4.2 and beyond)

**Backed by a new `AccountFlag` entity**, named generically rather than `PeerTokenAccountabilityFlag` — the platform's own stated preference for reusing infrastructure over building parallel systems argues for one flexible table over several narrow ones, and this task now gives that generality a second real use rather than a speculative one.

| Field | Type | Notes |
|---|---|---|
| `flag_id` | UUID/PK | |
| `account_id` | UUID/FK | The flagged account — meaning differs by `flag_type`, see below |
| `flag_type` | enum: `bad_peer_token_grant` / `ve_conduct_review` | |
| `related_token_grant_id` | UUID/FK, nullable | Populated for `bad_peer_token_grant` only; points to the specific `TokenGrant` under dispute |
| `status` | enum: pending / confirmed / dismissed | |
| `reason` | text | |
| `reviewed_by` | UUID/FK, nullable | The Moderator who confirmed or dismissed it |
| `created_at` / `resolved_at` | timestamp | |

**Two distinct flag types, two distinct consequences — do not conflate them:**

- **`bad_peer_token_grant`:** `account_id` is the *granting* educator, per Section 4.2's original accountability mechanism. If a Verified Educator grants a token to an account later found unqualified, the granting educator receives this flag once a Moderator confirms it — intentionally a soft consequence, not a punitive reputation system. Applies equally whether the vouched-for account was a fallback-path educator or a graduate student. **Confirming this flag also automatically corrects the recipient's own `Account.ve_status` to false.** This is not a discretionary revocation decision — the grant was invalid, so the recipient never legitimately held the status in the first place. There's nothing for a Moderator to weigh here beyond confirming the grant was in fact bad; the status correction follows automatically once that's confirmed.
- **`ve_conduct_review`:** `account_id` is the Verified Educator whose own behavior is under review, regardless of which path (institutional, license, or peer token) originally granted their status. `related_token_grant_id` stays null — this isn't about how status was obtained, it's about conduct since. **Confirming this flag does *not* automatically revoke `ve_status`.** A Moderator must take a separate, explicit action to revoke status if warranted; flag confirmation is a record that the concern was substantiated, not itself the revocation. This is a deliberate asymmetry with the case above: an invalid grant has only one correct outcome once confirmed, a behavior question genuinely requires human judgment about what response fits.

This is the mechanism `Account.ve_granted_by_account_id` and `TokenGrant` exist to support: a Moderator reviewing a `bad_peer_token_grant` flag needs to trace the dispute back to the specific `TokenGrant` row, not just a single current-pointer field on the recipient's account.

### 8. Account Status Badges (Section 21)

Three badges, independent and simultaneous (not competing for a display slot the way Awards are): **VE** (green), **LNC** (blue), **FotL** (yellow). All held badges display at once. Color pairing is deliberately blue/yellow, not red/green, for colorblind safety; each badge also carries its own letters so identification doesn't depend on color alone.

- **Tooltip:** opens on click or 1-second hover delay. Dismissal requires all four independent paths: click outside the combined badge/tooltip region, mouse-off the combined hitbox (hitbox must include the tooltip itself), Escape, and focus-loss (e.g., Tab). No close button — `role="tooltip"`, not a popover/disclosure widget.
- **Accessibility:** proper ARIA labeling (`aria-label` or `aria-describedby`), not a bare `title` attribute. Accessible name carries full meaning ("Verified Educator") independent of the visual tooltip.

Since Stage 1 doesn't build Certification Center or Payments & Billing, LNC and FotL badges will have no accounts to display on yet. Build the display logic against the schema regardless — it's a read against three independent boolean-derived flags, and there's no reason to gate it behind those other subsystems shipping first.

### 9. Awards backend only (Section 14)

Schema only. No nomination submission, no adjudication workflow, no category-administration tooling, no display-selection UI, no frontend surface at all. The two-table split (recurring category templates vs. dated instances) is explicit in the source design doc.

**AwardCategory:**

| Field | Type | Notes |
|---|---|---|
| `category_id` | UUID/PK | |
| `name` | string | e.g. "Best Math Module," "Prolific," "Great Explainer" |
| `attachment_target_type` | enum: account / seed / module | |
| `eligibility_threshold` | *undefined, leave nullable/placeholder* | Deliberately deferred pending platform activity data — the design doc itself flags this as not a schema gap, just an unset operational parameter |
| `is_cyclical` | boolean | Some categories are date-scoped (annual), some are not |

**AwardInstance:**

| Field | Type | Notes |
|---|---|---|
| `instance_id` | UUID/PK | |
| `category_id` | UUID/FK | |
| `cycle_label` | string, nullable | e.g. "2026," only for cyclical categories |
| `target_id` | UUID | The seed/module/account that won |
| `winning_creator_account_id` | UUID/FK, nullable | For seed/module targets — creator inherits display right, not the award record |
| `date_granted` | timestamp | |

**AwardNomination:**

| Field | Type | Notes |
|---|---|---|
| `nomination_id` | UUID/PK | |
| `nominator_account_id` | UUID/FK | Self-nomination disallowed |
| `target_id` | UUID | |
| `rationale` | text | Required, not optional |
| `adjudicated_by` | UUID/FK, nullable | Moderator, or platform-competition process |

**Display right is derived, not stored as its own row:** an account's selectable display badges are derived from the distinct categories the account has won at least one instance of. This derivation logic is part of the future frontend work, not this stage — noting it here only so the schema above doesn't accidentally preclude it.

### 10. Account and authentication email notifications (Section 16)

Seven of Section 16's notification triggers belong to User Management specifically. All seven route through Stage 0's Auth.js/Resend adapter (Mailpit in dev) — this is the email infrastructure Stage 0 already built, not the separate in-app Notification subsystem, which stays fully deferred:

- Email verification on signup (Task 2)
- Password reset (Task 2)
- Parent account deletion warning, child accounts attached (Task 3)
- Child account graduation notification (Task 3)
- Verified Educator status granted or rejected (Task 6)
- Peer token received (Task 6)
- Peer token refreshed (Task 6)

Opt-out is user-configurable in account settings by category, except account/security-critical emails, which are non-optional. Opt-out preference storage belongs to Account; the granular category grouping itself can wait for a real settings UI, but the schema should not preclude it.

---

## Acceptance criteria for Stage 1

- `schema.prisma` includes complete, real models for Account, Connection, ParentApproval, `VerificationApplication`, `TokenGrant`, `AccountFlag`, `TokenRequestThread`, AwardCategory, AwardInstance, and AwardNomination — no placeholders remaining from Stage 0's test user.
- Migrations for all of the above apply cleanly via `prisma migrate deploy` against both `DATABASE_URL` and `TEST_DATABASE_URL`, consistent with Stage 0's `check.sh`.
- `email_hash` and `display_name_hash` are indexed columns, verified by a query plan check, not just present in the schema.
- Core authentication (signup, login, logout, password reset, email verification) works end to end against the real Account schema, with the verification and reset emails visible in Mailpit during tests.
- Account lifecycle logic (DOB collection, child sub-account creation, automatic graduation with notification, deactivation, purge with the exact field-handling split above, and reclaim) is implemented and covered by tests Mailpit can verify where email is involved.
- Display name reuse blocking is tested for all three trigger points: new signup, an existing account's name change, and reclaim — not reclaim alone.
- Connection and ParentApproval logic enforces every pathway above, including the invite-link auto-accept exception (tested against a stubbed lesson-plan reference) and the adult-to-child two-pathway split, with the two ParentApproval types visually and functionally distinct in whatever UI surfaces this stage builds.
- Share Contact Information enforces both the mutual-Connection gate and the 18+/18+ gate, and does not expose the button at all to any account under 18.
- VE verification's manual review paths (K-12/professor, license-holder, peer token) are functional end to end for a human reviewer, backed by real `VerificationApplication` and `TokenGrant` rows, with rejection reason codes captured on every rejection and `Account.ve_granted_by_account_id` populated correctly on every peer-token grant.
- Peer token accountability creates a real `AccountFlag` row for both `bad_peer_token_grant` and `ve_conduct_review`. Confirming a `bad_peer_token_grant` flag automatically corrects the recipient's `ve_status` to false; confirming a `ve_conduct_review` flag does not automatically change `ve_status` and requires a separate Moderator action to do so.
- Account Status Badges render correctly for any combination of VE/LNC/FotL flags being true or false, including the all-false case, with full tooltip and accessibility behavior.
- Awards tables exist, accept inserts consistent with the schema above, and are reachable by nothing outside of direct database/API access — no nomination form, no adjudication queue, no badge-selection UI anywhere in the built application.
- All seven Task 10 email triggers fire correctly and are visible in Mailpit during tests.

---

## Open items carried forward

- **Grade auto-increment scheduling mechanism is unresolved.** The design doc says grade "auto-increments mid-August annually," which implies either a scheduled job bumping a stored value (requiring new Docker Compose infrastructure Stage 0 doesn't currently have) or a value computed lazily at read time from DOB and an enrollment-year reference (which would need no new infrastructure at all, but is a deviation from "stored separately" language worth confirming rather than assuming). Do not let Claude Code silently pick one — this needs an explicit decision before or during this stage's build.
- **`TokenRequestThread` is a deliberate stopgap, not a permanent design.** Track this for consolidation into the shared `Post`/`thread_type` model once Communication ships, so it doesn't quietly become a permanent parallel system by default.
- `veframework_onboarding_passed`'s actual mechanism (quiz vs. completion) and its sequencing relative to Section 4.1 verification remain undecided. The column exists; nothing depends on resolving this before Stage 1 is considered done.
- `AwardCategory.eligibility_threshold`'s type and value are genuinely unset pending platform activity data, per the design doc. Leave nullable; do not guess a placeholder value that could be mistaken for a real one later.
- Section 22's system map already assigns Awards to User Management (Part IV) correctly — no correction needed there. Worth adding one line to Section 22 noting the frontend/backend split decided here, so a future reader doesn't assume Awards shipping "in User Management" means the full feature is live.
