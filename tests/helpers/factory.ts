import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashDisplayName, hashEmail, hashPassword } from "@/lib/crypto";

// Direct-insert factories for tests that need an account but aren't exercising
// the signup flow itself. Every value is unique per call so serial test files
// never collide on email / display-name reuse checks.

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export function uniqueName(prefix = "Name"): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

export function dobForAge(years: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()),
  );
}

export interface MakeAccountOpts {
  email?: string;
  displayName?: string;
  ageYears?: number;
  password?: string;
  ve?: boolean;
}

export async function makeAccount(opts: MakeAccountOpts = {}) {
  const email = opts.email ?? uniqueEmail();
  const displayName = opts.displayName ?? uniqueName();
  return prisma.account.create({
    data: {
      email,
      email_hash: hashEmail(email),
      password_hash: await hashPassword(opts.password ?? "correct horse battery"),
      date_of_birth: dobForAge(opts.ageYears ?? 30),
      legal_name: displayName,
      display_name_hash: hashDisplayName(displayName),
      email_verified: new Date(),
      ve_status: opts.ve ?? false,
      ve_token_available: opts.ve ?? false,
    },
  });
}
