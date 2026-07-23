import { prisma } from "@/lib/prisma";
import { areConnected } from "@/lib/connections";
import { isAdultAccount } from "@/lib/lifecycle";

// Share Contact Information (brief Task 5).
//
// A single bounded action — NOT a messaging channel, and not a precedent for
// general messaging. It is the one exception to the platform-wide
// no-private-messaging rule.
//
// Two gates, both required:
//  1. An existing, mutually-accepted Connection between the two accounts.
//  2. Both accounts 18 or older, per stored date of birth. The action does not
//     appear AT ALL on any account 17 or under — including a graduated 13–17
//     standard account.

export class ContactShareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactShareError";
  }
}

// UI gate: whether the Share Contact Information control should be RENDERED at
// all for this account. Under-18 accounts must never see it (brief Task 5 /
// acceptance: "does not expose the button at all to any account under 18").
export function isContactSharingAvailableForActor(
  account: { date_of_birth: Date | null },
  now: Date = new Date(),
): boolean {
  return isAdultAccount(account, now);
}

// Perform the bounded share. Enforces BOTH gates server-side (the UI gate above
// is not the security boundary). Returns the counterpart's shareable contact
// (email) — a one-shot reveal, not an ongoing channel.
export async function shareContactInformation(
  fromAccountId: string,
  toAccountId: string,
  now: Date = new Date(),
): Promise<{ sharedEmail: string }> {
  const [from, to] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { account_id: fromAccountId } }),
    prisma.account.findUniqueOrThrow({ where: { account_id: toAccountId } }),
  ]);

  if (!isAdultAccount(from, now) || !isAdultAccount(to, now)) {
    throw new ContactShareError(
      "Both accounts must be 18 or older to share contact information.",
    );
  }

  if (!(await areConnected(fromAccountId, toAccountId))) {
    throw new ContactShareError(
      "A mutually-accepted Connection is required to share contact information.",
    );
  }

  if (!to.email) {
    throw new ContactShareError("The other account has no shareable contact.");
  }

  return { sharedEmail: to.email };
}
