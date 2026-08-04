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

// ===========================================================================
// Library resolution of the above open question (this sub-stage).
// ===========================================================================

// The REAL endorsement resolver Module Editor's gate was stubbed against: a
// module's primary seed is "endorsed" iff it has at least one live Endorsement.
// This is the single source of truth for endorsement-status visibility; pass it
// into canViewModule in place of the test stub.
export async function seedHasEndorsement(primarySeedId: string): Promise<boolean> {
  const one = await prisma.endorsement.findFirst({
    where: { seed_id: primarySeedId },
    select: { endorsement_id: true },
  });
  return one != null;
}

// Access-at-all check, wired to the real resolver. This is the "reachable via
// search / direct link" question Module Editor already answered by age:
//   * endorsed primary seed → visible to all ages;
//   * unendorsed → adults (18+) only, minors blocked entirely.
export function canAccessModule(
  viewer: { date_of_birth: Date | null },
  moduleId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return canViewModule(viewer, moduleId, seedHasEndorsement, now);
}

// The "public section" PROMOTION — resolves the open question Module Editor's
// brief left explicit ("the event that moves it to the public section"). Passive
// discovery (browse, recommendations, homepage) is DISTINCT from mere search
// reachability: before its primary seed has any endorsement a module is
// search-only (adults) / invisible (minors) per canAccessModule above; the FIRST
// endorsement on the primary seed promotes it to full passive-discovery
// visibility FOR ALL AGES.
//
// The promotion is STATE-DERIVED, not a stored flag: it holds exactly while the
// primary seed carries at least one endorsement, so it is automatically correct
// for a module born on an already-endorsed seed and automatically reverses if
// the last endorsement is toggled off (consistent with Section 2.2 treating the
// Module Author / Seed Architect characteristics as reevaluated on endorsement
// removal). No age branch here: once promoted, minors see it too.
export async function canPassiveDiscoverModule(moduleId: string): Promise<boolean> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: { primary_seed_id: true, status: true },
  });
  // Only a live (published) module is ever in the public section; a draft or a
  // module on moderation hold is never passively discoverable regardless of its
  // seed's endorsement state.
  if (module.status !== "published") return false;
  return seedHasEndorsement(module.primary_seed_id);
}
