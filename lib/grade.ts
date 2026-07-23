// Grade & age helpers.
//
// OPEN ITEM (brief Open Items — do NOT silently pick an implementation):
// grade "auto-increments mid-August annually". Two mechanisms were possible:
//   (a) a scheduled job bumping the stored value — needs new Docker Compose
//       infrastructure Stage 0 does not have;
//   (b) lazy computation at read time from a stored base grade + the date it
//       was set — needs no new infrastructure.
//
// This module implements (b): the `grade` column stores the base value and
// `grade_anchor_date` stores when it was set; the *effective* grade is derived
// at read time by counting the number of mid-August rollovers that have elapsed
// since the anchor. This deliberately introduces NO scheduler and NO
// docker-compose changes. Per the brief, this lean is flagged in the delivery
// summary for confirmation rather than committed to silently — nothing here
// forecloses swapping in mechanism (a) later, since the stored base grade is
// preserved exactly as Task 1 requires.

// Single configurable rollover date. Country-specific adjustment is explicitly
// deferred (Section 18); this is the platform-wide default (mid-August).
export const GRADE_ROLLOVER_MONTH = 8; // August (1-indexed)
export const GRADE_ROLLOVER_DAY = 15; // mid-August

// Count how many rollover boundaries fall in (anchor, now].
function rolloversBetween(anchor: Date, now: Date): number {
  if (now <= anchor) return 0;

  // The rollover instant for a given calendar year.
  const rolloverForYear = (year: number) =>
    new Date(Date.UTC(year, GRADE_ROLLOVER_MONTH - 1, GRADE_ROLLOVER_DAY));

  let count = 0;
  for (let year = anchor.getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    const boundary = rolloverForYear(year);
    if (boundary > anchor && boundary <= now) count++;
  }
  return count;
}

// Effective (read-time) grade: stored base grade plus elapsed rollovers.
export function effectiveGrade(
  baseGrade: number | null,
  anchorDate: Date | null,
  now: Date = new Date(),
): number | null {
  if (baseGrade === null || baseGrade === undefined) return null;
  if (!anchorDate) return baseGrade;
  return baseGrade + rolloversBetween(anchorDate, now);
}

// Whole-year age from a stored date of birth.
export function ageInYears(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age--;
  }
  return age;
}

export function isAdult(dob: Date, now: Date = new Date()): boolean {
  return ageInYears(dob, now) >= 18;
}

// Graduation is at the 13th birthday, driven by stored DOB (not grade).
export function hasReachedGraduationAge(dob: Date, now: Date = new Date()): boolean {
  return ageInYears(dob, now) >= 13;
}
