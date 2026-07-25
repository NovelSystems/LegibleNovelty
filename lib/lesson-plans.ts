import { prisma } from "@/lib/prisma";

// Workshop — Lesson Planner (Section 12.1). A lesson plan is a "playlist": an
// ordered list of published modules a community member curates, plus assignment
// records that hand a plan to specific learners.
//
// DELIBERATELY UN-GATED (Task 1 / Task 2). There is NO ve_status check and NO
// DSS authoring-lock check anywhere in this file — not on creation, not on
// sequence editing, not on assignment. Lesson-plan curation is interaction with
// already-vetted, already-published content, not authoring new pedagogical
// material, so the DSS authoring population (Seed Architects / Module Authors)
// does not extend here. That absence is load-bearing and is proven by tests
// (a DSS-latched account can still create and assign), not just left implicit.
//
// assertDssNotLocked is intentionally NOT imported. If you are adding a gate
// here, that is a spec change (see the brief's Task 1 flag) — not a fix.

export class LessonPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonPlanError";
  }
}

// --- creation + playlist editing (Task 1) ------------------------------------

// Create a lesson plan. No content gate, no role/VE check, no DSS check.
export async function createLessonPlan(
  args: { creatorAccountId: string; title: string; isPublic?: boolean; moduleIds?: string[] },
  now: Date = new Date(),
) {
  if (!args.title.trim()) throw new LessonPlanError("A lesson plan title is required.");
  return prisma.lessonPlan.create({
    data: {
      creator_account_id: args.creatorAccountId,
      title: args.title,
      is_public: args.isPublic ?? false,
      created_at: now,
      // Initial playlist entries, in the order provided. Live module references.
      module_sequence: args.moduleIds?.length
        ? { create: args.moduleIds.map((module_id, i) => ({ module_id, position: i })) }
        : undefined,
    },
    include: { module_sequence: { orderBy: { position: "asc" } } },
  });
}

async function loadPlanOwnedBy(lessonPlanId: string, creatorAccountId: string) {
  const plan = await prisma.lessonPlan.findUnique({ where: { lesson_plan_id: lessonPlanId } });
  if (!plan) throw new LessonPlanError("Lesson plan not found.");
  if (plan.creator_account_id !== creatorAccountId) {
    throw new LessonPlanError("Only the lesson plan's creator may edit its sequence.");
  }
  return plan;
}

// Append a module to the end of the playlist. Stores the LIVE module_id — no
// version/revision pin — so the entry always resolves to the module's current
// published state.
export async function addModuleToPlan(lessonPlanId: string, creatorAccountId: string, moduleId: string) {
  await loadPlanOwnedBy(lessonPlanId, creatorAccountId);
  const module = await prisma.contextualizedModule.findUnique({ where: { module_id: moduleId } });
  if (!module) throw new LessonPlanError("Module not found.");
  const count = await prisma.lessonPlanModule.count({ where: { lesson_plan_id: lessonPlanId } });
  return prisma.lessonPlanModule.create({
    data: { lesson_plan_id: lessonPlanId, module_id: moduleId, position: count },
  });
}

// Remove a module from the playlist and close the positional gap so ordering
// stays a dense 0..n-1 sequence.
export async function removeModuleFromPlan(lessonPlanId: string, creatorAccountId: string, entryId: string) {
  await loadPlanOwnedBy(lessonPlanId, creatorAccountId);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.lessonPlanModule.findUnique({ where: { id: entryId } });
    if (!entry || entry.lesson_plan_id !== lessonPlanId) {
      throw new LessonPlanError("Playlist entry not found on this lesson plan.");
    }
    await tx.lessonPlanModule.delete({ where: { id: entryId } });
    const after = await tx.lessonPlanModule.findMany({
      where: { lesson_plan_id: lessonPlanId, position: { gt: entry.position } },
      orderBy: { position: "asc" },
    });
    for (const e of after) {
      await tx.lessonPlanModule.update({ where: { id: e.id }, data: { position: e.position - 1 } });
    }
  });
}

// Reorder the whole playlist to the given entry-id order. Rewrites positions in
// one transaction; every current entry must appear exactly once.
export async function reorderPlanModules(
  lessonPlanId: string,
  creatorAccountId: string,
  orderedEntryIds: string[],
) {
  await loadPlanOwnedBy(lessonPlanId, creatorAccountId);
  return prisma.$transaction(async (tx) => {
    const current = await tx.lessonPlanModule.findMany({ where: { lesson_plan_id: lessonPlanId } });
    const currentIds = new Set(current.map((e) => e.id));
    if (
      orderedEntryIds.length !== current.length ||
      new Set(orderedEntryIds).size !== orderedEntryIds.length ||
      !orderedEntryIds.every((id) => currentIds.has(id))
    ) {
      throw new LessonPlanError("Reorder must list each current playlist entry exactly once.");
    }
    // Two-phase to avoid transient duplicate positions: park negatives, then set.
    for (let i = 0; i < orderedEntryIds.length; i++) {
      await tx.lessonPlanModule.update({ where: { id: orderedEntryIds[i] }, data: { position: -1 - i } });
    }
    for (let i = 0; i < orderedEntryIds.length; i++) {
      await tx.lessonPlanModule.update({ where: { id: orderedEntryIds[i] }, data: { position: i } });
    }
    return tx.lessonPlanModule.findMany({
      where: { lesson_plan_id: lessonPlanId },
      orderBy: { position: "asc" },
    });
  });
}

export async function setLessonPlanVisibility(lessonPlanId: string, creatorAccountId: string, isPublic: boolean) {
  await loadPlanOwnedBy(lessonPlanId, creatorAccountId);
  return prisma.lessonPlan.update({
    where: { lesson_plan_id: lessonPlanId },
    data: { is_public: isPublic },
  });
}

// Resolve a plan's playlist to the LIVE modules it currently references. Because
// each entry stores module_id (not a pinned version), this always reflects the
// module's current published state — a module edited after being added shows up
// here at its new version with no stale snapshot anywhere.
export async function getLessonPlanSequence(lessonPlanId: string) {
  const entries = await prisma.lessonPlanModule.findMany({
    where: { lesson_plan_id: lessonPlanId },
    orderBy: { position: "asc" },
    include: { module: true },
  });
  return entries.map((e) => ({
    entryId: e.id,
    position: e.position,
    moduleId: e.module_id,
    module: e.module, // the CURRENT module row, live
  }));
}

// --- assignment (Task 2) -----------------------------------------------------

// Assign a lesson plan to a set of learners over a date range. The assigner need
// not be the creator (a teacher may assign a colleague's plan) and does NOT need
// VE status. Each call creates its OWN assignment record so the same plan handed
// to different cohorts never conflates data. No DSS check.
export async function assignLessonPlan(
  args: {
    lessonPlanId: string;
    assignerAccountId: string;
    learnerIds: string[];
    dateRangeStart: Date;
    dateRangeEnd: Date;
  },
) {
  const plan = await prisma.lessonPlan.findUnique({ where: { lesson_plan_id: args.lessonPlanId } });
  if (!plan) throw new LessonPlanError("Lesson plan not found.");
  if (args.learnerIds.length === 0) throw new LessonPlanError("An assignment needs at least one learner.");
  if (args.dateRangeEnd < args.dateRangeStart) {
    throw new LessonPlanError("date_range_end must not precede date_range_start.");
  }
  return prisma.lessonPlanAssignment.create({
    data: {
      lesson_plan_id: args.lessonPlanId,
      assigner_account_id: args.assignerAccountId,
      assigned_learner_ids: args.learnerIds,
      date_range_start: args.dateRangeStart,
      date_range_end: args.dateRangeEnd,
    },
  });
}

// --- completion submission prompt (Task 5) -----------------------------------

// When a learner finishes a module reached VIA a lesson-plan assignment, they
// are prompted to send results to whoever ASSIGNED it. This builds only the
// trigger + routing, keyed off the assignment relationship (Task 2); the
// logged-in/verified gating itself is Library's (Section 7.4) and is deferred.
//
// Returns the routing target(s): one prompt per assignment that (a) belongs to
// this learner, (b) includes this module in its plan, and (c) is active at the
// completion time. Because routing is keyed to the assignment (not just the
// plan), the same module completed under two different assignments routes two
// independent prompts — cohorts never conflate.
export interface CompletionPrompt {
  assignmentId: string;
  lessonPlanId: string;
  moduleId: string;
  learnerId: string;
  routeToAssignerAccountId: string;
}

export async function completionSubmissionPrompts(
  args: { learnerId: string; moduleId: string; completedAt?: Date },
): Promise<CompletionPrompt[]> {
  const at = args.completedAt ?? new Date();
  const assignments = await prisma.lessonPlanAssignment.findMany({
    where: {
      assigned_learner_ids: { has: args.learnerId },
      date_range_start: { lte: at },
      date_range_end: { gte: at },
      lesson_plan: { module_sequence: { some: { module_id: args.moduleId } } },
    },
  });
  return assignments.map((a) => ({
    assignmentId: a.assignment_id,
    lessonPlanId: a.lesson_plan_id,
    moduleId: args.moduleId,
    learnerId: args.learnerId,
    routeToAssignerAccountId: a.assigner_account_id,
  }));
}
