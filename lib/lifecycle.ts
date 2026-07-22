import { prisma } from "@/lib/prisma";
import type { Account } from "@prisma/client";
import {
  generatePseudonymousIdentifier,
  generateToken,
  hashDisplayName,
  hashEmail,
  hashPassword,
  verifyPassword,
} from "@/lib/crypto";
import {
  sendGraduationNotification,
  sendParentDeletionWarning,
  sendReclaimVerification,
} from "@/lib/mail";
import { assertDisplayNameAvailable } from "@/lib/accounts";
import { ageInYears, effectiveGrade } from "@/lib/grade";

// Account lifecycle logic (brief Task 3): child sub-accounts, automatic
// graduation, parent dormancy/deletion, deactivation vs. purge, and reclaim.

const RECLAIM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// --- 3.2 Child sub-accounts --------------------------------------------------

export interface CreateChildArgs {
  parentAccountId: string;
  dateOfBirth: Date; // Stored, never displayed.
  legalName: string; // Stored, never displayed.
  grade: number;
  country: string;
}

// COPPA/FERPA posture (3.6): a child sub-account is a real DB record created BY
// the parent (the compliance mechanism for under-13 creation, not a checkbox).
// A child has no public handle — public identity is "A [grade] learner from
// [Country]" — so no display_name_hash is assigned and no reuse check applies.
export async function createChildSubAccount(args: CreateChildArgs) {
  return prisma.account.create({
    data: {
      is_child_subaccount: true,
      parent_account_id: args.parentAccountId,
      date_of_birth: args.dateOfBirth,
      legal_name: args.legalName,
      grade: args.grade,
      grade_anchor_date: new Date(),
      country: args.country,
      // No email/password: access is mediated through the parent (COPPA).
    },
  });
}

// Public identity string for a child sub-account — no name, no exact age.
export function childPublicIdentity(
  account: Pick<Account, "grade" | "grade_anchor_date" | "country">,
  now: Date = new Date(),
): string {
  const grade = effectiveGrade(account.grade, account.grade_anchor_date, now);
  return `A ${grade ?? "?"} learner from ${account.country ?? "an undisclosed country"}`;
}

// --- 3.3 Automatic graduation ------------------------------------------------

// Graduation is automatic at the 13th birthday, driven by stored DOB (NOT
// grade). This batch is idempotent: it graduates only child sub-accounts that
// have turned 13 and flips is_child_subaccount to false, so re-running never
// re-notifies. The mechanism that calls this on a schedule is the same
// unresolved Open Item as grade auto-increment (see lib/grade.ts) — leaning
// toward a read-time/lazy or lightweight trigger rather than new scheduler
// infrastructure; flagged for confirmation.
export async function processGraduations(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 13, now.getUTCMonth(), now.getUTCDate()),
  );
  const due = await prisma.account.findMany({
    where: {
      is_child_subaccount: true,
      date_of_birth: { not: null, lte: cutoff },
    },
    include: { parent: true },
  });

  const graduated: string[] = [];
  for (const child of due) {
    await prisma.account.update({
      where: { account_id: child.account_id },
      // Graduate to a standard account. Adult (18+) gating stays a separate
      // per-feature DOB check — graduation does not confer adult features.
      data: { is_child_subaccount: false },
    });
    // A child sub-account has no email of its own (COPPA, parent-mediated), so
    // the graduation notice goes to the child's own address if one exists,
    // otherwise the managing parent's. (Recipient was unspecified in the brief;
    // flagged as an assumption in the delivery summary.)
    const recipient = child.email ?? child.parent?.email ?? null;
    if (recipient) {
      const optOuts = child.email
        ? child.notification_opt_outs
        : (child.parent?.notification_opt_outs ?? []);
      await sendGraduationNotification(recipient, optOuts);
    }
    graduated.push(child.account_id);
  }
  return graduated;
}

// A graduated 13–17 account is still ineligible for any 18+-gated feature. Each
// such feature checks DOB directly via this helper, not graduation status.
export function isAdultAccount(
  account: Pick<Account, "date_of_birth">,
  now: Date = new Date(),
): boolean {
  return account.date_of_birth != null && ageInYears(account.date_of_birth, now) >= 18;
}

// --- 3.4 Parent dormancy and deletion ---------------------------------------

// Dormant parents require no action; children keep functioning. This handles
// actual parent DELETION (deactivate or purge), which is gated by a warning and
// one of Task 10's email triggers when child accounts are attached.
export async function warnAndDeleteParent(
  parentAccountId: string,
  mode: "deactivate" | "purge",
): Promise<void> {
  const parent = await prisma.account.findUniqueOrThrow({
    where: { account_id: parentAccountId },
    include: { children: true },
  });

  if (parent.children.length > 0 && parent.email) {
    await sendParentDeletionWarning(
      parent.email,
      parent.notification_opt_outs,
      parent.children.length,
    );
  }

  if (mode === "deactivate") {
    await deactivateAccount(parentAccountId);
  } else {
    await purgeAccount(parentAccountId);
  }
}

// After parent deletion, a child under 13 is held: inaccessible for NEW logins
// until its 13th birthday. (It can still read all modules anonymously — that
// needs no account at all.) Returns true if login must be blocked.
export function childLoginBlockedByParent(
  child: Pick<Account, "is_child_subaccount" | "date_of_birth">,
  parent: Pick<Account, "account_status"> | null,
  now: Date = new Date(),
): boolean {
  if (!child.is_child_subaccount) return false;
  if (!parent) return false;
  if (parent.account_status === "active") return false;
  // Parent deactivated/purged: block until the child reaches 13.
  return child.date_of_birth != null && ageInYears(child.date_of_birth, now) < 13;
}

// The self-service escape hatch offered on the blocked-child login screen:
// purge my own account immediately rather than wait for my 13th birthday.
export async function childPurgeSelf(childAccountId: string): Promise<void> {
  await purgeAccount(childAccountId);
}

// --- 3.5 Deactivation vs. purge ---------------------------------------------

// Deactivation: suspends the account, all data intact, fully reactivatable.
export async function deactivateAccount(accountId: string): Promise<void> {
  await prisma.$transaction([
    prisma.account.update({
      where: { account_id: accountId },
      data: { account_status: "deactivated", deactivated_at: new Date() },
    }),
    prisma.session.deleteMany({ where: { account_id: accountId } }),
  ]);
}

export async function reactivateAccount(accountId: string): Promise<void> {
  await prisma.account.update({
    where: { account_id: accountId },
    data: { account_status: "active", deactivated_at: null },
  });
}

// Purge: delete/overwrite PII, retain the account shell for referential
// integrity, with a reclaim path (no plaintext tombstone). The field-handling
// split below matches brief Task 3.5 exactly.
export async function purgeAccount(accountId: string): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { account_id: accountId },
  });

  const pseudonym = generatePseudonymousIdentifier();

  await prisma.$transaction(async (tx) => {
    // The purged handle is retired PERMANENTLY (platform-wide reuse block),
    // independent of what later happens to this row on reclaim.
    if (account.display_name_hash) {
      await tx.retiredDisplayName.upsert({
        where: { hash: account.display_name_hash },
        create: { hash: account.display_name_hash },
        update: {},
      });
    }

    await tx.account.update({
      where: { account_id: accountId },
      data: {
        account_status: "purged",
        purged_at: new Date(),
        purged_pseudonymous_identifier: pseudonym,

        // --- Deleted entirely on purge ---
        // Profile info, country, grade, DOB, language prefs, plaintext display
        // name (replaced by the pseudonymous identifier), plaintext email.
        // legal_name is non-null, so it is overwritten with the pseudonym
        // rather than nulled ("replaced by the generated pseudonymous
        // identifier").
        legal_name: pseudonym,
        preferred_display_name: null,
        display_name_use_preferred: false,
        country: null,
        grade: null,
        grade_anchor_date: null,
        date_of_birth: null,
        language_preference: [],
        interest_domains: [],
        email: null,

        // --- Retained hashed only (reclaim-flow use; not reversible) ---
        // email_hash, password_hash, display_name_hash are left untouched.

        // Interest/VE convenience state is cleared for a clean shell; the
        // TokenGrant table remains the accountability system of record.
        ve_status: false,
        ve_token_available: false,
      },
    });

    // Sessions and PII-bearing tokens (they store target_email) are removed.
    await tx.session.deleteMany({ where: { account_id: accountId } });
    await tx.accountToken.deleteMany({ where: { account_id: accountId } });
  });

  // Retained in the clear (untouched above): account_id, the pseudonymous
  // identifier, child associations (parent_account_id / children), and any
  // system-generated content attribution / correction history rows elsewhere.
  return pseudonym;
}

// --- 3.5 Reclaim flow --------------------------------------------------------

export class ReclaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReclaimError";
  }
}

// Step 1: attempted signup/login with an email matching a purged account's
// stored hash triggers a reclaim prompt. Old password submitted → hash match
// required → verification email sent to the entered address. Password mismatch
// → reclaim fails (told they may create a new account instead). There is NO
// password-reset path for a purged account.
export async function beginReclaim(
  email: string,
  oldPassword: string,
): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { email_hash: hashEmail(email), account_status: "purged" },
  });
  if (!account) {
    throw new ReclaimError("No purged account matches this email.");
  }
  if (!account.password_hash) {
    throw new ReclaimError("This account cannot be reclaimed by password.");
  }
  const ok = await verifyPassword(oldPassword, account.password_hash);
  if (!ok) {
    // Told they may create a new account instead — the old password is the only
    // reclaim credential; there is no reset path here.
    throw new ReclaimError(
      "Password does not match. You may create a new account instead.",
    );
  }

  const token = generateToken();
  await prisma.accountToken.create({
    data: {
      token,
      type: "reclaim",
      account_id: account.account_id,
      target_email: email,
      expires: new Date(Date.now() + RECLAIM_TOKEN_TTL_MS),
    },
  });
  // Verification email to the entered address; the link click proves current
  // control of that address.
  await sendReclaimVerification(email, token);
  return token;
}

export interface CompleteReclaimArgs {
  token: string;
  newDisplayName: string; // Prompted at reclaim; old handle stays blocked.
  dateOfBirth: Date; // Current DOB re-collected at reclaim.
  newPassword?: string; // Optional: set a fresh password on restore.
}

// Step 2: link click proves control → login restored; person prompted for a new
// display name and current date of birth. Reclaim does NOT restore pre-purge
// identity to old content (that stays attributed to the pseudonym).
export async function completeReclaim(args: CompleteReclaimArgs) {
  const row = await prisma.accountToken.findUnique({
    where: { token: args.token },
  });
  if (
    !row ||
    row.type !== "reclaim" ||
    row.consumed_at ||
    row.expires < new Date() ||
    !row.target_email
  ) {
    throw new ReclaimError("Invalid or expired reclaim token.");
  }

  // The new display name is subject to platform-wide reuse blocking, which
  // INCLUDES the person's own retired purged handle — they cannot re-take it.
  await assertDisplayNameAvailable(args.newDisplayName);

  const email = row.target_email;
  await prisma.$transaction(async (tx) => {
    await tx.accountToken.update({
      where: { token: args.token },
      data: { consumed_at: new Date() },
    });
    await tx.account.update({
      where: { account_id: row.account_id },
      data: {
        account_status: "active",
        purged_at: null,
        email,
        email_hash: hashEmail(email),
        email_verified: new Date(), // Control just proven via the reclaim link.
        date_of_birth: args.dateOfBirth,
        legal_name: args.newDisplayName,
        preferred_display_name: null,
        display_name_use_preferred: false,
        display_name_hash: hashDisplayName(args.newDisplayName),
        ...(args.newPassword
          ? { password_hash: await hashPassword(args.newPassword) }
          : {}),
      },
    });
  });

  return prisma.account.findUniqueOrThrow({
    where: { account_id: row.account_id },
  });
}
