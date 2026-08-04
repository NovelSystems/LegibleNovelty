import { prisma } from "@/lib/prisma";
import type { Account } from "@prisma/client";

// The shared anti-bot eligibility gate (master design Section 9.5): an account
// must be at least 7 days old AND have a completed profile to take certain
// community actions.
//
// ONE FUNCTION, MANY CALL SITES. Section 9.5 names three consumers of this exact
// same gate — Community Recommendation (Section 9.2), public module comments
// (Section 11.2), and the commission support button (Section 13). Only
// Community Recommendation exists today; Communication and the Commission
// Marketplace are deferred. This is deliberately built once, here, as its own
// callable function so those later surfaces call THIS, not a second copy of the
// 7-day/profile logic. Do not inline this check at a call site.
//
// The gate returns RICH status (not a bare boolean) precisely so the calling
// UI can render the onboarding-framed message Section 9.5 requires — "explore
// modules during your first week" with the days remaining — rather than a flat
// rejection. `daysRemaining` and `profileComplete` are what that copy needs.

export const ELIGIBILITY_MIN_ACCOUNT_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class EligibilityError extends Error {
  constructor(
    public readonly status: EligibilityStatus,
    message: string,
  ) {
    super(message);
    this.name = "EligibilityError";
  }
}

export interface EligibilityStatus {
  eligible: boolean;
  // Whole days still remaining before the 7-day account-age requirement is met
  // (0 once satisfied). Powers the "explore modules during your first week"
  // onboarding copy — the reason this returns detail, not just a boolean.
  daysRemaining: number;
  accountAgeDays: number;
  ageRequirementMet: boolean;
  profileComplete: boolean;
}

// What counts as a "completed profile" (INFERENCE — flagged in the delivery
// summary). Section 9.5 requires "a completed profile" but never enumerates the
// fields, and the master design has no standalone profile-completeness
// definition. Given the gate's stated purpose is anti-bot, the operative bar is:
//
//   1. a verified email (email_verified set) — the strongest single anti-bot
//      signal, and the platform already gates real use on it; and
//   2. at least one interest domain AND at least one language preference — the
//      two fields the design consistently treats as "the user's profile"
//      (Sections 9.6 "use my interests", the "Do you feel lucky?" routing in
//      Section 11, and the purge field list in Section 3.5), i.e. the fields a
//      genuine human fills in during onboarding and a drive-by bot does not.
//
// This is intentionally the SINGLE place the definition lives; adjust it here if
// the intended profile-completeness bar differs, and every call site follows.
export function isProfileComplete(
  account: Pick<
    Account,
    "email_verified" | "interest_domains" | "language_preference"
  >,
): boolean {
  return (
    account.email_verified != null &&
    account.interest_domains.length > 0 &&
    account.language_preference.length > 0
  );
}

export function accountAgeInDays(
  createdAt: Date,
  now: Date = new Date(),
): number {
  return Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
}

// Compute the full eligibility status for an account without throwing — the read
// a calling surface uses to decide whether to show the action or the onboarding
// message. `now` is injectable for deterministic tests.
export async function checkEligibility(
  accountId: string,
  now: Date = new Date(),
): Promise<EligibilityStatus> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { account_id: accountId },
    select: {
      created_at: true,
      email_verified: true,
      interest_domains: true,
      language_preference: true,
    },
  });
  return evaluateEligibility(account, now);
}

// The pure evaluation, factored out so it can be unit-tested against a plain
// object and reused by any caller that already holds the account row.
export function evaluateEligibility(
  account: Pick<
    Account,
    "created_at" | "email_verified" | "interest_domains" | "language_preference"
  >,
  now: Date = new Date(),
): EligibilityStatus {
  const accountAgeDays = accountAgeInDays(account.created_at, now);
  const ageRequirementMet = accountAgeDays >= ELIGIBILITY_MIN_ACCOUNT_AGE_DAYS;
  const daysRemaining = Math.max(
    0,
    ELIGIBILITY_MIN_ACCOUNT_AGE_DAYS - accountAgeDays,
  );
  const profileComplete = isProfileComplete(account);
  return {
    eligible: ageRequirementMet && profileComplete,
    daysRemaining,
    accountAgeDays,
    ageRequirementMet,
    profileComplete,
  };
}

// The enforcing variant: throws EligibilityError (carrying the full status) when
// the account may not act. The message is onboarding-framed per Section 9.5, and
// the attached `status` lets a caller surface days-remaining / profile-missing
// specifics without re-querying.
export async function assertEligible(
  accountId: string,
  now: Date = new Date(),
): Promise<EligibilityStatus> {
  const status = await checkEligibility(accountId, now);
  if (status.eligible) return status;

  const message = !status.ageRequirementMet
    ? `Your account is still new — explore modules during your first week; ` +
      `you can recommend and comment in ${status.daysRemaining} more ` +
      `day${status.daysRemaining === 1 ? "" : "s"}.`
    : `Complete your profile (add your interests and a language) to unlock ` +
      `recommending and commenting.`;
  throw new EligibilityError(status, message);
}
