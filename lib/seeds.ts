import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { assertCanPublish } from "@/lib/quota";

// Learning Seed lifecycle + the private draft-sharing/comment workflow
// (Seed Editor Tasks 1, 2, 4). No authoring gate: any account may create a
// seed draft (no VE requirement, no threshold).

export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedError";
  }
}

// --- Placement validation ----------------------------------------------------

// A seed is placed at a (Subject, Topic) pair; the Topic must be a real topic
// node nested under the given Subject. Two-level taxonomy only.
async function assertValidPlacement(subjectId: string, topicId: string) {
  const [subject, topic] = await Promise.all([
    prisma.taxonomy.findUnique({ where: { taxonomy_id: subjectId } }),
    prisma.taxonomy.findUnique({ where: { taxonomy_id: topicId } }),
  ]);
  if (!subject || subject.level !== "subject") {
    throw new SeedError("subject_id must reference a Subject taxonomy node.");
  }
  if (!topic || topic.level !== "topic") {
    throw new SeedError("topic_id must reference a Topic taxonomy node.");
  }
  if (topic.parent_id !== subjectId) {
    throw new SeedError("topic must be nested under the given subject.");
  }
}

// --- Create ------------------------------------------------------------------

export interface CreateSeedArgs {
  architectAccountId: string;
  learningObjective: string;
  entryPrerequisite: string;
  lessonSizeScope: string;
  subjectId: string;
  topicId: string;
  gradeRange: string;
  notes: string;
  language?: string;
  algorithmicConstraints?: Prisma.InputJsonValue;
  targetLearnerCharacteristics?: string;
  associatedCommissionId?: string; // Soft reference; unenforced.
  isEnrichment?: boolean;
}

export async function createSeedDraft(args: CreateSeedArgs) {
  await assertValidPlacement(args.subjectId, args.topicId); // Self-placement.
  return prisma.learningSeed.create({
    data: {
      architect_account_id: args.architectAccountId,
      learning_objective: args.learningObjective,
      entry_prerequisite: args.entryPrerequisite,
      lesson_size_scope: args.lessonSizeScope,
      subject_id: args.subjectId,
      topic_id: args.topicId,
      grade_range: args.gradeRange,
      notes: args.notes,
      language: args.language ?? "en",
      algorithmic_constraints: args.algorithmicConstraints,
      target_learner_characteristics: args.targetLearnerCharacteristics ?? null,
      associated_commission_id: args.associatedCommissionId ?? null,
      is_enrichment: args.isEnrichment ?? false,
      status: "draft",
    },
  });
}

async function loadSeedOwnedBy(seedId: string, architectAccountId: string) {
  const seed = await prisma.learningSeed.findUnique({ where: { seed_id: seedId } });
  if (!seed || seed.deleted_at) throw new SeedError("Seed not found.");
  if (seed.architect_account_id !== architectAccountId) {
    throw new SeedError("Only the seed's architect may perform this action.");
  }
  return seed;
}

// --- Draft sharing (Section 7.1) ---------------------------------------------

// Invite a SPECIFIC registered account (never an open link) to view/comment on
// a draft. Only the architect may invite, and only while the seed is a draft.
export async function inviteToDraft(
  seedId: string,
  architectAccountId: string,
  invitedAccountId: string,
) {
  const seed = await loadSeedOwnedBy(seedId, architectAccountId);
  if (seed.status !== "draft") {
    throw new SeedError("Only drafts can be shared for review.");
  }
  if (invitedAccountId === architectAccountId) {
    throw new SeedError("The architect already has access to their own draft.");
  }
  return prisma.seedDraftInvite.create({
    data: { seed_id: seedId, invited_account_id: invitedAccountId },
  });
}

export async function revokeInvite(inviteId: string, architectAccountId: string) {
  const invite = await prisma.seedDraftInvite.findUniqueOrThrow({
    where: { invite_id: inviteId },
    include: { seed: true },
  });
  if (invite.seed.architect_account_id !== architectAccountId) {
    throw new SeedError("Only the seed's architect may revoke an invite.");
  }
  return prisma.seedDraftInvite.update({
    where: { invite_id: inviteId },
    data: { revoked_at: new Date() },
  });
}

// Whether an account currently has active (non-revoked) draft access.
export async function hasActiveDraftAccess(
  seedId: string,
  accountId: string,
): Promise<boolean> {
  const invite = await prisma.seedDraftInvite.findFirst({
    where: { seed_id: seedId, invited_account_id: accountId, revoked_at: null },
    select: { invite_id: true },
  });
  return invite != null;
}

// --- Comments (generic mechanism; Section 7.1) -------------------------------

// GENERIC comment insert — the actor is NOT hardcoded to "invited reviewer".
// The invited-reviewer path (addDraftReviewComment) and Library's future
// endorsing-VE path (veFlagPlacement) both funnel through this same call.
export async function addComment(args: {
  seedId: string;
  commenterAccountId: string;
  body: string;
  parentCommentId?: string;
}) {
  return prisma.seedDraftComment.create({
    data: {
      seed_id: args.seedId,
      commenter_account_id: args.commenterAccountId,
      body: args.body,
      parent_comment_id: args.parentCommentId ?? null,
      status: "open",
    },
  });
}

// The invited-draft-reviewer entry point: gated on active draft access. This is
// policy layered over the generic mechanism above, not a separate table.
export async function addDraftReviewComment(args: {
  seedId: string;
  commenterAccountId: string;
  body: string;
  parentCommentId?: string;
}) {
  if (!(await hasActiveDraftAccess(args.seedId, args.commenterAccountId))) {
    throw new SeedError("Only an invited reviewer with active access may comment.");
  }
  return addComment(args);
}

// The architect resolves or dismisses comments at their SOLE discretion; no
// external edit ever merges into the draft.
export async function resolveComment(commentId: string, architectAccountId: string) {
  return setCommentStatus(commentId, architectAccountId, "resolved");
}
export async function dismissComment(commentId: string, architectAccountId: string) {
  return setCommentStatus(commentId, architectAccountId, "dismissed");
}
async function setCommentStatus(
  commentId: string,
  architectAccountId: string,
  status: "resolved" | "dismissed",
) {
  const comment = await prisma.seedDraftComment.findUniqueOrThrow({
    where: { comment_id: commentId },
    include: { seed: true },
  });
  if (comment.seed.architect_account_id !== architectAccountId) {
    throw new SeedError("Only the seed's architect may resolve or dismiss comments.");
  }
  return prisma.seedDraftComment.update({
    where: { comment_id: commentId },
    data: { status, resolved_at: new Date() },
  });
}

// --- Submit / publish / delete ----------------------------------------------

// Submit a draft to Pending Review. Share access AUTO-REVOKES here: every active
// invite for this seed is revoked in the same operation.
export async function submitForReview(seedId: string, architectAccountId: string) {
  const seed = await loadSeedOwnedBy(seedId, architectAccountId);
  if (seed.status !== "draft") {
    throw new SeedError("Only a draft can be submitted for review.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.seedDraftInvite.updateMany({
      where: { seed_id: seedId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return tx.learningSeed.update({
      where: { seed_id: seedId },
      data: { status: "pending_review" },
    });
  });
}

// Publish a seed. pending_review → published needs NO human check; the quota is
// the control (enforced here, immediately before the flip).
export async function publishSeed(
  seedId: string,
  architectAccountId: string,
  now: Date = new Date(),
) {
  const seed = await loadSeedOwnedBy(seedId, architectAccountId);
  if (seed.status !== "pending_review") {
    throw new SeedError("Only a seed in pending review can be published.");
  }
  await assertCanPublish(architectAccountId, now);
  return prisma.learningSeed.update({
    where: { seed_id: seedId },
    data: { status: "published", published_at: now },
  });
}

// Soft delete (same convention as Stage 1's Account). A published seed's slot is
// freed immediately for the concurrent cap, without losing the row.
export async function deleteSeed(seedId: string, architectAccountId: string) {
  await loadSeedOwnedBy(seedId, architectAccountId);
  return prisma.learningSeed.update({
    where: { seed_id: seedId },
    data: { deleted_at: new Date() },
  });
}

// --- Two placement-touching paths, DELIBERATELY ASYMMETRIC -------------------

// Path A — the architect's OWN post-publication placement correction. A
// self-service fix based on community feedback: it updates subject/topic and
// does NOTHING else — no status change, no comment, no return to Draft.
export async function reviseOwnPlacement(
  seedId: string,
  architectAccountId: string,
  placement: { subjectId: string; topicId: string },
) {
  const seed = await loadSeedOwnedBy(seedId, architectAccountId);
  if (seed.status !== "published") {
    throw new SeedError("Self-service placement revision applies post-publication.");
  }
  await assertValidPlacement(placement.subjectId, placement.topicId);
  return prisma.learningSeed.update({
    where: { seed_id: seedId },
    data: { subject_id: placement.subjectId, topic_id: placement.topicId },
    // NOTE: no status change, no comment — a self-service correction.
  });
}

// Path B — an endorsing VE's placement FLAG during endorsement review. A formal
// objection: it goes through Task 4's comment mechanism AND forces the seed back
// to Draft, where it stays until the architect revises and resubmits. It does
// NOT itself change the placement.
//
// This is the entry point Library's Endorsement will call; it's built and tested
// here against a stub (any account id as the flagging VE), since Endorsement
// itself doesn't exist yet.
export async function veFlagPlacement(args: {
  seedId: string;
  veAccountId: string;
  body: string;
}) {
  const seed = await prisma.learningSeed.findUnique({
    where: { seed_id: args.seedId },
  });
  if (!seed || seed.deleted_at) throw new SeedError("Seed not found.");

  return prisma.$transaction(async (tx) => {
    const comment = await tx.seedDraftComment.create({
      data: {
        seed_id: args.seedId,
        commenter_account_id: args.veAccountId, // Generic actor: an endorsing VE.
        body: args.body,
        status: "open",
      },
    });
    const updated = await tx.learningSeed.update({
      where: { seed_id: args.seedId },
      data: { status: "draft" }, // Formal objection → back to Draft.
    });
    return { comment, seed: updated };
  });
}
