import { prisma } from "@/lib/prisma";

// Lesson Planner — tracking dashboard (Task 4). Shown to the ASSIGNER: per
// learner, per module, a completion status, filterable by date range (and, as a
// natural extension the acceptance criteria call for, by learner and by module).
//
// The real completion data lives in Library's Progress Archive (Section 7.5) and
// Quiz/Scoring (Section 7.4), neither of which is built. Per the project's
// forward-build pattern, the dashboard is built against a STUBBED completion
// SIGNAL injected by the caller, so its query shape and filtering are fully
// testable now and swap to the real source later with no shape change.

export type CompletionStatus = "not_started" | "in_progress" | "completed";

// The injected signal. Keyed by (assignmentId, learnerId, moduleId) so the SAME
// learner completing the SAME module under two different assignments is reported
// independently — cohorts never conflate (acceptance criterion). Returns a
// status; the default stub treats everything as not started.
export type CompletionSignal = (key: {
  assignmentId: string;
  learnerId: string;
  moduleId: string;
}) => CompletionStatus | Promise<CompletionStatus>;

const NOT_STARTED_STUB: CompletionSignal = () => "not_started";

export interface DashboardCell {
  assignmentId: string;
  lessonPlanId: string;
  learnerId: string;
  moduleId: string;
  position: number; // the module's order within the plan
  status: CompletionStatus;
}

export interface DashboardFilter {
  // Only assignments whose date range OVERLAPS [start, end] are included. Either
  // bound may be omitted for an open-ended window.
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  learnerId?: string; // restrict to one learner
  moduleId?: string; // restrict to one module
}

// Build the assigner's dashboard: one cell per (assignment, learner, module),
// filtered as requested, with each cell's status pulled from the completion
// signal. Ordering is stable: by assignment creation, then learner, then module
// position.
export async function buildAssignerDashboard(
  assignerAccountId: string,
  filter: DashboardFilter = {},
  signal: CompletionSignal = NOT_STARTED_STUB,
): Promise<DashboardCell[]> {
  // Date-range filter: an assignment overlaps the window unless it ends before
  // the window starts or starts after the window ends.
  const dateWhere: Record<string, unknown> = {};
  if (filter.dateRangeEnd) dateWhere.date_range_start = { lte: filter.dateRangeEnd };
  if (filter.dateRangeStart) dateWhere.date_range_end = { gte: filter.dateRangeStart };

  const assignments = await prisma.lessonPlanAssignment.findMany({
    where: {
      assigner_account_id: assignerAccountId,
      ...dateWhere,
      ...(filter.learnerId ? { assigned_learner_ids: { has: filter.learnerId } } : {}),
    },
    orderBy: { created_at: "asc" },
    include: {
      lesson_plan: {
        include: { module_sequence: { orderBy: { position: "asc" } } },
      },
    },
  });

  const cells: DashboardCell[] = [];
  for (const a of assignments) {
    const learners = filter.learnerId
      ? a.assigned_learner_ids.filter((l) => l === filter.learnerId)
      : a.assigned_learner_ids;
    const modules = filter.moduleId
      ? a.lesson_plan.module_sequence.filter((m) => m.module_id === filter.moduleId)
      : a.lesson_plan.module_sequence;

    for (const learnerId of learners) {
      for (const m of modules) {
        cells.push({
          assignmentId: a.assignment_id,
          lessonPlanId: a.lesson_plan_id,
          learnerId,
          moduleId: m.module_id,
          position: m.position,
          status: await signal({ assignmentId: a.assignment_id, learnerId, moduleId: m.module_id }),
        });
      }
    }
  }
  return cells;
}
