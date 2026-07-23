import { prisma } from "@/lib/prisma";
import {
  generateToken,
  hashDisplayName,
  hashEmail,
  hashPassword,
  verifyPassword,
} from "@/lib/crypto";
import {
  sendEmailVerification,
  sendGraduationNotification,
  sendPasswordReset,
} from "@/lib/mail";
import { ageInYears } from "@/lib/grade";

// Core authentication (brief Task 2): signup, login, logout, password reset,
// email verification — all against the real Account schema and database
// sessions (not JWT), matching Stage 0's Auth.js configuration.

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h for verification/reset tokens.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d session lifetime.

export class DisplayNameTakenError extends Error {
  constructor() {
    super("That display name is not available.");
    this.name = "DisplayNameTakenError";
  }
}

export class ReclaimRequiredError extends Error {
  // Signup/login was attempted against an email whose hash matches a purged
  // account. The caller must route the person into the reclaim flow
  // (lib/lifecycle.ts) rather than creating a new account or resetting a
  // password — there is no ordinary password-reset path for a purged account.
  constructor(public readonly purgedAccountId: string) {
    super("This email belongs to a purged account; use the reclaim flow.");
    this.name = "ReclaimRequiredError";
  }
}

// Display-name reuse blocking is PLATFORM-WIDE and checked on EVERY assignment
// (signup, rename, reclaim) — not only at reclaim (brief Task 3). Any name whose
// hash already appears in `display_name_hash` anywhere is blocked, which
// includes the permanently-retained hashes of purged accounts' old handles.
export async function assertDisplayNameAvailable(
  name: string,
  opts: { excludeAccountId?: string } = {},
): Promise<void> {
  const hash = hashDisplayName(name);

  // (1) Retired (purged) handles — permanently blocked, even for the same
  //     person reclaiming their own account. Not excluded by excludeAccountId.
  const retired = await prisma.retiredDisplayName.findUnique({
    where: { hash },
    select: { hash: true },
  });
  if (retired) throw new DisplayNameTakenError();

  // (2) Currently-held handles on active/deactivated accounts. Purged accounts
  //     are covered by (1), so they're excluded here to avoid depending on the
  //     overwritten-on-reclaim row hash.
  const existing = await prisma.account.findFirst({
    where: {
      display_name_hash: hash,
      account_status: { not: "purged" },
      ...(opts.excludeAccountId
        ? { account_id: { not: opts.excludeAccountId } }
        : {}),
    },
    select: { account_id: true },
  });
  if (existing) throw new DisplayNameTakenError();
}

function effectiveDisplayName(args: {
  legalName: string;
  preferredDisplayName?: string | null;
  usePreferred?: boolean;
}): string {
  return args.usePreferred && args.preferredDisplayName
    ? args.preferredDisplayName
    : args.legalName;
}

export interface SignupArgs {
  email: string;
  password: string;
  dateOfBirth: Date; // Required at creation for every account (brief Task 3.1).
  legalName: string;
  preferredDisplayName?: string;
  usePreferred?: boolean;
  country?: string;
  languagePreference?: string[];
  interestDomains?: string[];
}

// Ordinary self-service signup for an adult/standard account. Child sub-accounts
// are created via lib/lifecycle.ts (parent-driven), not here.
export async function signup(args: SignupArgs) {
  const emailHash = hashEmail(args.email);

  // Reclaim takes precedence: an email matching a purged account's stored hash
  // must route to reclaim, never create a fresh row silently on top of it.
  const purged = await prisma.account.findFirst({
    where: { email_hash: emailHash, account_status: "purged" },
    select: { account_id: true },
  });
  if (purged) throw new ReclaimRequiredError(purged.account_id);

  const existing = await prisma.account.findUnique({
    where: { email: args.email },
    select: { account_id: true },
  });
  if (existing) throw new Error("An account with this email already exists.");

  const displayName = effectiveDisplayName({
    legalName: args.legalName,
    preferredDisplayName: args.preferredDisplayName,
    usePreferred: args.usePreferred,
  });
  await assertDisplayNameAvailable(displayName);

  const account = await prisma.account.create({
    data: {
      email: args.email,
      email_hash: emailHash,
      password_hash: await hashPassword(args.password),
      date_of_birth: args.dateOfBirth,
      legal_name: args.legalName,
      preferred_display_name: args.preferredDisplayName ?? null,
      display_name_use_preferred: args.usePreferred ?? false,
      display_name_hash: hashDisplayName(displayName),
      country: args.country ?? null,
      language_preference: args.languagePreference ?? [],
      interest_domains: args.interestDomains ?? [],
    },
  });

  await issueEmailVerification(account.account_id, args.email);
  return account;
}

// Issue (or re-issue) a signup email-verification token and send the mail.
export async function issueEmailVerification(accountId: string, email: string) {
  const token = generateToken();
  await prisma.accountToken.create({
    data: {
      token,
      type: "email_verification",
      account_id: accountId,
      target_email: email,
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  await sendEmailVerification(email, token);
  return token;
}

export async function verifyEmail(token: string): Promise<boolean> {
  const row = await prisma.accountToken.findUnique({ where: { token } });
  if (
    !row ||
    row.type !== "email_verification" ||
    row.consumed_at ||
    row.expires < new Date()
  ) {
    return false;
  }
  await prisma.$transaction([
    prisma.accountToken.update({
      where: { token },
      data: { consumed_at: new Date() },
    }),
    prisma.account.update({
      where: { account_id: row.account_id },
      data: { email_verified: new Date() },
    }),
  ]);
  return true;
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginError";
  }
}

// A child account whose parent was deleted is held out of NEW logins until its
// 13th birthday (Task 3.4). The blocked-login screen explains this and offers to
// purge the child's own account immediately (childPurgeSelf in lib/lifecycle).
// The account id is carried so that self-purge action can target it.
export class ChildAccessBlockedError extends Error {
  constructor(public readonly childAccountId: string) {
    super(
      "This account is temporarily unavailable because the managing parent " +
        "account was deleted. Access returns at age 13.",
    );
    this.name = "ChildAccessBlockedError";
  }
}

// Password login → creates a database-backed Session row and returns its token
// (to be set as the Auth.js session cookie). Auth.js resolves this cookie via
// the Account-backed adapter in lib/auth-adapter.ts.
export async function login(email: string, password: string): Promise<string> {
  const account = await prisma.account.findUnique({ where: { email } });

  // Purged accounts have their plaintext email nulled, so the lookup above
  // misses them by design. Route by email hash into reclaim instead.
  if (!account) {
    const purged = await prisma.account.findFirst({
      where: { email_hash: hashEmail(email), account_status: "purged" },
      select: { account_id: true },
    });
    if (purged) throw new ReclaimRequiredError(purged.account_id);
    throw new LoginError("Invalid email or password.");
  }

  if (account.account_status === "deactivated") {
    throw new LoginError("This account is deactivated. Reactivate to log in.");
  }
  if (!account.password_hash) {
    throw new LoginError("Invalid email or password.");
  }
  const ok = await verifyPassword(password, account.password_hash);
  if (!ok) throw new LoginError("Invalid email or password.");

  // Child-mode transitions are evaluated lazily on this login check (no
  // scheduler; consistent with the grade auto-increment lean). Two cases, in
  // order:
  if (account.is_child_subaccount && account.date_of_birth) {
    if (ageInYears(account.date_of_birth) >= 13) {
      // Automatic graduation at the 13th birthday (Task 3.3), driven by stored
      // DOB. Flip the child out of child mode and fire the graduation
      // notification once (idempotent: the flag flip means later logins skip
      // this). The graduated 13–17 account remains ineligible for 18+ features
      // — those check DOB directly, not graduation status. (processGraduations
      // in lib/lifecycle is the equivalent batch path for accounts that never
      // log in.)
      await prisma.account.update({
        where: { account_id: account.account_id },
        data: { is_child_subaccount: false },
      });
      if (account.email) {
        await sendGraduationNotification(
          account.email,
          account.notification_opt_outs,
        );
      }
    } else if (account.parent_account_id) {
      // Parent-deletion holding state (Task 3.4): an under-13 child whose parent
      // account is no longer active is blocked from new logins. Mirrors the
      // childLoginBlockedByParent predicate in lib/lifecycle (kept inline here
      // to avoid an accounts↔lifecycle import cycle).
      const parent = await prisma.account.findUnique({
        where: { account_id: account.parent_account_id },
        select: { account_status: true },
      });
      if (parent && parent.account_status !== "active") {
        throw new ChildAccessBlockedError(account.account_id);
      }
    }
  }

  return createSessionFor(account.account_id);
}

export async function createSessionFor(accountId: string): Promise<string> {
  const sessionToken = generateToken();
  await prisma.session.create({
    data: {
      session_token: sessionToken,
      account_id: accountId,
      expires: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return sessionToken;
}

export async function logout(sessionToken: string): Promise<void> {
  await prisma.session
    .delete({ where: { session_token: sessionToken } })
    .catch(() => undefined); // Idempotent: already-gone session is not an error.
}

// Ordinary forgot-password flow, for any ACTIVE (non-purged) account. This is
// the baseline the reclaim flow's "no password-reset path for a purged account"
// documentation is contrasted against (brief Task 2). Returns false (without
// leaking existence) if no eligible account matches.
export async function requestPasswordReset(email: string): Promise<boolean> {
  const account = await prisma.account.findUnique({
    where: { email },
    select: { account_id: true, account_status: true },
  });
  if (!account || account.account_status !== "active") {
    // Deactivated → must reactivate; purged → reclaim, not reset. Either way,
    // no reset mail. (Purged accounts have no plaintext email to match anyway.)
    return false;
  }

  const token = generateToken();
  await prisma.accountToken.create({
    data: {
      token,
      type: "password_reset",
      account_id: account.account_id,
      target_email: email,
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  await sendPasswordReset(email, token);
  return true;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<boolean> {
  const row = await prisma.accountToken.findUnique({ where: { token } });
  if (
    !row ||
    row.type !== "password_reset" ||
    row.consumed_at ||
    row.expires < new Date()
  ) {
    return false;
  }
  await prisma.$transaction([
    prisma.accountToken.update({
      where: { token },
      data: { consumed_at: new Date() },
    }),
    prisma.account.update({
      where: { account_id: row.account_id },
      data: { password_hash: await hashPassword(newPassword) },
    }),
    // Revoke all existing sessions on a password reset.
    prisma.session.deleteMany({ where: { account_id: row.account_id } }),
  ]);
  return true;
}

// Change the public display name of an existing account. Re-checks reuse
// blocking (brief Task 3: "an existing account changing its name" is one of the
// three trigger points).
export async function changeDisplayName(
  accountId: string,
  newName: string,
  opts: { usePreferred?: boolean } = {},
): Promise<void> {
  await assertDisplayNameAvailable(newName, { excludeAccountId: accountId });
  await prisma.account.update({
    where: { account_id: accountId },
    data: {
      ...(opts.usePreferred
        ? { preferred_display_name: newName, display_name_use_preferred: true }
        : { legal_name: newName }),
      display_name_hash: hashDisplayName(newName),
    },
  });
}
