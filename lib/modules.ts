import { prisma } from "@/lib/prisma";
import type { ContextualizedModule, Prisma } from "@prisma/client";
import { assertDssNotLocked } from "@/lib/standing-scores";

// Contextualized Module lifecycle + version control + the deterministic
// publication gate (Module Editor Tasks 1-3).
//
// REUSE: the DSS authoring lock is the EXACT SAME assertDssNotLocked function the
// Seed Editor already calls — extended to gate module create/edit/publish, not a
// second parallel implementation.

export const MAX_SECONDARY_SEEDS = 3;

export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleError";
  }
}

// Thrown by the two deterministic publication-gate checks (Section 8.3).
export class PublicationGateError extends ModuleError {
  constructor(
    public readonly check: "commission_alignment" | "seed_alignment",
    message: string,
  ) {
    super(message);
    this.name = "PublicationGateError";
  }
}

// --- helpers -----------------------------------------------------------------

async function loadModuleOwnedBy(moduleId: string, authorAccountId: string) {
  const module = await prisma.contextualizedModule.findUnique({ where: { module_id: moduleId } });
  if (!module) throw new ModuleError("Module not found.");
  if (module.author_account_id !== authorAccountId) {
    throw new ModuleError("Only the module's author may perform this action.");
  }
  return module;
}

// The latest SeedRevision of a seed — what a new citation pins to. A module
// requires a published primary seed (which always has a baseline revision 1).
async function latestSeedRevision(seedId: string) {
  const rev = await prisma.seedRevision.findFirst({
    where: { seed_id: seedId },
    orderBy: { revision_number: "desc" },
  });
  if (!rev) {
    throw new ModuleError("The seed has no published revision to build against.");
  }
  return rev;
}

// Deterministic content extraction for the alignment checks: the concatenated
// plain text of a module's `text` elements. (A text element's content is TipTap
// rich content; tests/authoring provide a `plainText` mirror for indexing.)
async function aggregateModuleText(moduleId: string): Promise<string> {
  const elements = await prisma.moduleElement.findMany({
    where: { page: { module_id: moduleId }, element_type: "text" },
  });
  return elements
    .map((e) => {
      const c = e.content as { plainText?: string; text?: string } | null;
      return c?.plainText ?? c?.text ?? "";
    })
    .join(" ");
}

// Pilot-era MECHANICAL alignment rule (Section 8.3 specifies "deterministic rule
// comparison against structured data" but not the exact algorithm): every
// significant word (length >= 4) of the requirement text must appear in the
// module content. Flagged in the summary as a mechanical stand-in.
function significantWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
}
function contentSatisfies(moduleText: string, requirement: string): boolean {
  const have = new Set(significantWords(moduleText));
  const need = significantWords(requirement);
  if (need.length === 0) return true;
  return need.every((w) => have.has(w));
}

// --- create / secondary seeds ------------------------------------------------

// createModule does NOT gate on seed content-completeness. A Module references a
// primary Seed *revision*, which only exists once the seed has been published;
// beyond that (and the DSS lock), nothing here gates creation — matching the
// Module Editor brief, which names no seed-completeness precondition. The
// referential "primary seed must be published" check lives at the module's
// publish transition (submitForReview), alongside the ai_attestation check.
export async function createModule(
  args: { authorAccountId: string; primarySeedId: string; aiAttestation?: Prisma.ContextualizedModuleCreateInput["ai_attestation"] },
  now: Date = new Date(),
) {
  await assertDssNotLocked(args.authorAccountId, now); // REUSE — same function.
  const rev = await latestSeedRevision(args.primarySeedId);
  return prisma.contextualizedModule.create({
    data: {
      author_account_id: args.authorAccountId,
      primary_seed_id: args.primarySeedId,
      primary_seed_revision_id: rev.revision_id, // Pinned, permanent.
      ai_attestation: args.aiAttestation ?? null,
    },
  });
}

// Secondary seeds are editable only while a draft (locked at submission), max 3,
// each pinned to a SeedRevision like the primary (inferred requirement).
export async function addSecondarySeed(moduleId: string, authorId: string, seedId: string) {
  const module = await loadModuleOwnedBy(moduleId, authorId);
  await assertDssNotLocked(authorId);
  if (module.status !== "draft") {
    throw new ModuleError("Secondary seeds are locked once submitted for review.");
  }
  const count = await prisma.moduleSecondarySeed.count({ where: { module_id: moduleId } });
  if (count >= MAX_SECONDARY_SEEDS) {
    throw new ModuleError(`A module may cite at most ${MAX_SECONDARY_SEEDS} secondary seeds.`);
  }
  const rev = await latestSeedRevision(seedId);
  return prisma.moduleSecondarySeed.create({
    data: { module_id: moduleId, seed_revision_id: rev.revision_id },
  });
}

export async function removeSecondarySeed(moduleId: string, authorId: string, secondaryId: string) {
  const module = await loadModuleOwnedBy(moduleId, authorId);
  if (module.status !== "draft") {
    throw new ModuleError("Secondary seeds are locked once submitted for review.");
  }
  await prisma.moduleSecondarySeed.delete({ where: { id: secondaryId } });
}

// --- derived fields ----------------------------------------------------------

// Inherited from the pinned primary seed revision, not stored.
export async function moduleLessonSizeScope(moduleId: string): Promise<string> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    include: { primary_seed_revision: true },
  });
  return module.primary_seed_revision.lesson_size_scope;
}

// Inherited from the primary seed's chain relationships, not separately authored.
export async function modulePrerequisiteFollowonRefs(moduleId: string) {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
  });
  const [prereq, followon] = await Promise.all([
    prisma.seedChain.findMany({ where: { to_seed_id: module.primary_seed_id } }),
    prisma.seedChain.findMany({ where: { from_seed_id: module.primary_seed_id } }),
  ]);
  return {
    prerequisites: prereq.map((e) => e.from_seed_id),
    followOns: followon.map((e) => e.to_seed_id),
  };
}

// --- commission / seed reference / AI attestation ----------------------------

// Associate (or change) a commission. The snapshot text freezes on first set and
// never updates after (Task 2), regardless of later commission changes.
export async function setCommission(
  moduleId: string,
  authorId: string,
  commissionId: string | null,
  description?: string,
) {
  const module = await loadModuleOwnedBy(moduleId, authorId);
  await assertDssNotLocked(authorId);
  return prisma.contextualizedModule.update({
    where: { module_id: moduleId },
    data: {
      associated_commission_id: commissionId,
      // Freeze once; never overwrite an existing snapshot.
      ...(module.commission_snapshot_text == null && description
        ? { commission_snapshot_text: description }
        : {}),
    },
  });
}

// Change the primary seed reference on an existing module. Re-pins to the new
// seed's latest revision and arms the seed-alignment check for the next publish.
export async function changeSeedReference(moduleId: string, authorId: string, newSeedId: string) {
  await loadModuleOwnedBy(moduleId, authorId); // ownership check
  await assertDssNotLocked(authorId);
  const rev = await latestSeedRevision(newSeedId);
  return prisma.contextualizedModule.update({
    where: { module_id: moduleId },
    data: {
      primary_seed_id: newSeedId,
      primary_seed_revision_id: rev.revision_id,
      seed_ref_changed: true, // Re-triggers the seed-alignment check on publish.
      last_edited_at: new Date(),
    },
  });
}

// AI attestation locks permanently once it is ai_pipeline (Task 2): a module
// declared ai_pipeline can never be redeclared to another tier.
export async function setAiAttestation(
  moduleId: string,
  authorId: string,
  attestation: NonNullable<ContextualizedModule["ai_attestation"]>,
) {
  const module = await loadModuleOwnedBy(moduleId, authorId);
  if (module.ai_attestation === "ai_pipeline") {
    throw new ModuleError("AI attestation is locked (AI-Pipeline-authored).");
  }
  return prisma.contextualizedModule.update({
    where: { module_id: moduleId },
    data: { ai_attestation: attestation },
  });
}

// Record a content edit (used by authoring). Sets last_edited_at for Library's
// "edited under you" warning and enforces the DSS authoring lock.
export async function touchModuleEdited(moduleId: string, authorId: string, now: Date = new Date()) {
  await loadModuleOwnedBy(moduleId, authorId);
  await assertDssNotLocked(authorId, now);
  return prisma.contextualizedModule.update({
    where: { module_id: moduleId },
    data: { last_edited_at: now },
  });
}

// --- lifecycle transitions ---------------------------------------------------

export async function submitForReview(moduleId: string, authorId: string, now: Date = new Date()) {
  const module = await loadModuleOwnedBy(moduleId, authorId);
  await assertDssNotLocked(authorId, now);
  if (module.status !== "draft") {
    throw new ModuleError("Only a draft can be submitted for review.");
  }
  if (module.ai_attestation == null) {
    throw new ModuleError("An AI attestation must be declared before submitting for review.");
  }
  // Referential gate: a Module cannot publish while pointing at a primary seed
  // that was never itself published. This is NOT a re-check of seed content-
  // completeness (that gate was removed) — only that the referenced seed reached
  // published status. Secondary seeds are intentionally not checked here (see the
  // module-authoring test); they are already pinned to a SeedRevision at add
  // time, which only exists post-publish.
  const primarySeed = await prisma.learningSeed.findUniqueOrThrow({
    where: { seed_id: module.primary_seed_id },
  });
  if (primarySeed.published_at == null) {
    throw new ModuleError("The primary seed must be published before the module can be submitted for review.");
  }
  return prisma.contextualizedModule.update({
    where: { module_id: moduleId },
    data: { status: "pending_review" }, // Secondary seeds are now locked.
  });
}

// The deterministic publication gate (Task 3), then publish. Reuses the DSS lock.
export async function publishModule(moduleId: string, authorId: string, now: Date = new Date()) {
  const module = await loadModuleOwnedBy(moduleId, authorId);
  await assertDssNotLocked(authorId, now); // REUSE — same function.
  if (module.status !== "pending_review" && module.status !== "published") {
    throw new ModuleError("Only a module in pending review (or a published module being re-released) can be published.");
  }

  // Check 1 — commission alignment: a STRUCTURAL NO-OP for now. Commission
  // Marketplace isn't built — associated_commission_id is a nullable soft
  // reference with no real structured commission fields behind it, so there is
  // nothing genuinely structured to compare against. The check therefore
  // trivially passes whether the reference is null or set. DEFERRED: when
  // Commission Marketplace ships with real structured fields (subject, topic,
  // declared scope), rebuild this to compare those fields DIRECTLY (ID/enum
  // equality), not by parsing text. (Deliberately no text-content comparison.)

  // Check 2 — seed alignment (only if the seed reference was changed). Seed is
  // real, populated, structured data today, so this check stays as built.
  if (module.seed_ref_changed) {
    const moduleText = await aggregateModuleText(moduleId);
    const rev = await prisma.seedRevision.findUniqueOrThrow({
      where: { revision_id: module.primary_seed_revision_id },
    });
    if (!contentSatisfies(moduleText, rev.learning_objective)) {
      throw new PublicationGateError(
        "seed_alignment",
        "Module content does not satisfy the newly-referenced seed's learning objective. Revise the content to align with the new seed before publishing.",
      );
    }
  }

  // Snapshot the element-count baseline for this newly-published version — the
  // reference point Library's "edited under you" warning measures later edits
  // against (element-count delta, the structural analog of a line-count delta).
  const publishedElementCount = await prisma.moduleElement.count({
    where: { page: { module_id: moduleId } },
  });

  // Publish: increment the version (a distinct published release), stamp the
  // date, clear the seed-alignment arm, and RE-ARM takedown (the new version no
  // longer matches takedown_disarmed_version).
  return prisma.contextualizedModule.update({
    where: { module_id: moduleId },
    data: {
      status: "published",
      version: module.version + 1,
      publication_date: now,
      seed_ref_changed: false,
      auto_taken_down: false,
      published_element_count: publishedElementCount,
    },
  });
}
