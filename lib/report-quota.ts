import { prisma } from "@/lib/prisma";
import { startOfPacificDay } from "@/lib/pacific-time";

// Shared report quota (Standing Scores Task 6 / Module Editor Task 4 / Lesson
// Planner Task 3). One cap of 3 reports per calendar day (midnight Pacific)
// COMBINED across content types. Seed, module, and lesson-plan reports all count
// against it here; comment reports will be added once that surface exists —
// same cap, same reset, one function.

export const REPORT_DAILY_CAP = 3;

// Combined count of this reporter's reports today (Pacific day), across seeds,
// modules, and lesson plans.
export async function combinedReportsTodayCount(
  reporterAccountId: string,
  now: Date = new Date(),
): Promise<number> {
  const since = startOfPacificDay(now);
  const where = { reporter_account_id: reporterAccountId, created_at: { gte: since } };
  const [seeds, modules, lessonPlans] = await Promise.all([
    prisma.seedReport.count({ where }),
    prisma.moduleReport.count({ where }),
    prisma.lessonPlanReport.count({ where }),
  ]);
  return seeds + modules + lessonPlans;
}

export function overReportCap(count: number): boolean {
  return count >= REPORT_DAILY_CAP;
}
