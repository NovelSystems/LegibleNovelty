import { prisma } from "@/lib/prisma";
import { isAdultAccount } from "@/lib/lifecycle";

// Under-18 endorsement visibility gate — backend support only (Module Editor
// Task 6). The rule is AGE-based, not status-based:
//   * A module whose primary seed has ZERO endorsements is invisible to any
//     account under 18 (covers both is_child_subaccount and 13-17 graduated
//     minors — a single date-of-birth check), under any circumstance.
//   * Adult (18+) accounts can reach an unendorsed module (via search).
//   * Endorsed content is visible to all ages.
//
// VE/LNC status is NOT a factor here — an ordinary adult Community Member must be
// able to find and report unendorsed content; that is the whole point (it is the
// community-reporting safety net Task 4 depends on).
//
// REUSE: the 18+ decision is the SAME isAdultAccount logic Stage 1's Share
// Contact Information feature uses — not a second age calculation.
//
// Endorsement counts live in Library (deferred). We take a stubbed resolver so
// the check is cheap against the stable primary_seed_id FK Library will join on.

export type EndorsementResolver = (primarySeedId: string) => Promise<boolean> | boolean;

export async function canViewModule(
  viewer: { date_of_birth: Date | null },
  moduleId: string,
  hasEndorsement: EndorsementResolver,
  now: Date = new Date(),
): Promise<boolean> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: { primary_seed_id: true },
  });
  if (await hasEndorsement(module.primary_seed_id)) return true; // visible to all ages
  // Unendorsed → adults only (reusing the same 18+ check as Share Contact Info).
  return isAdultAccount(viewer, now);
}

// NOTE for Library: whether unendorsed content is search-reachable ONLY, or also
// surfaced via passive discovery (browse/recommendations/homepage) for adults,
// is Library's call — this gate answers only "may this account access it at all",
// and the underlying check is a cheap join against primary_seed_id.
