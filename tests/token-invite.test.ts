import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  claimPeerTokenGrant,
  grantPeerToken,
  grantPeerTokenByEmail,
  reconcileExpiredPeerTokenGrants,
  VerificationError,
} from "@/lib/verification";
import { lockStandingScoreDirectly } from "@/lib/standing-scores";
import { prisma as db } from "@/lib/prisma";
import { makeAccount, uniqueEmail, dobForAge } from "./helpers/factory";

// VE token grant to an email that has no account yet — invite-link flow with a
// lazy 28-day expiry. The existing-account path stays instant and unchanged.

const DAY = 24 * 60 * 60 * 1000;

describe("VE peer-token grant-to-email + 28-day expiry", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps the existing-account grant instant and unaffected", async () => {
    const granter = await makeAccount({ ve: true });
    const recipient = await makeAccount({ email: uniqueEmail("has-account") });

    const result = await grantPeerTokenByEmail(granter.account_id, recipient.email!);
    expect(result.instant).toBe(true);

    const recipAfter = await prisma.account.findUniqueOrThrow({ where: { account_id: recipient.account_id } });
    expect(recipAfter.ve_status).toBe(true); // Conferred immediately.
    expect(recipAfter.ve_granted_by_account_id).toBe(granter.account_id);
    const granterAfter = await prisma.account.findUniqueOrThrow({ where: { account_id: granter.account_id } });
    expect(granterAfter.ve_token_available).toBe(false); // Token consumed.
  });

  it("creates a pending invite for a no-account email and confers VE only on claim", async () => {
    const granter = await makeAccount({ ve: true });
    const inviteEmail = uniqueEmail("no-account");

    const result = await grantPeerTokenByEmail(granter.account_id, inviteEmail);
    expect(result.instant).toBe(false);
    expect(result.grant.recipient_account_id).toBeNull();
    expect(result.grant.recipient_email).toBe(inviteEmail);
    expect(result.grant.claimed_at).toBeNull();
    // Token consumed at grant time.
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: granter.account_id } })).ve_token_available,
    ).toBe(false);

    // Claim within the window by creating the account → VE conferred now.
    const claim = await claimPeerTokenGrant(result.grant.grant_id, {
      email: inviteEmail,
      password: "claimer password",
      dateOfBirth: dobForAge(30),
      legalName: "Claimer",
    });
    expect(claim.account.ve_status).toBe(true);
    expect(claim.account.ve_granted_by_account_id).toBe(granter.account_id);

    const grant = await prisma.tokenGrant.findUniqueOrThrow({ where: { grant_id: result.grant.grant_id } });
    expect(grant.recipient_account_id).toBe(claim.account.account_id);
    expect(grant.claimed_at).not.toBeNull();
  });

  it("expires an unclaimed invite after 28 days, leaving no VE and freeing the granter's token", async () => {
    const granter = await makeAccount({ ve: true });
    const inviteEmail = uniqueEmail("will-expire");
    const t0 = new Date("2025-05-01T00:00:00Z");

    const result = await grantPeerTokenByEmail(granter.account_id, inviteEmail, t0);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: granter.account_id } })).ve_token_available,
    ).toBe(false);

    // 29 days later, still unclaimed → lazily reconcile expiry.
    const later = new Date(t0.getTime() + 29 * DAY);
    const freed = await reconcileExpiredPeerTokenGrants(granter.account_id, later);
    expect(freed).toBe(true);

    // Granter's token is free again, as if the grant never happened.
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: granter.account_id } })).ve_token_available,
    ).toBe(true);
    // No account was created for the invited email → no VE anywhere.
    expect(await prisma.account.findUnique({ where: { email: inviteEmail } })).toBeNull();

    // The now-expired invite cannot be claimed.
    await expect(
      claimPeerTokenGrant(result.grant.grant_id, {
        email: inviteEmail,
        password: "too late now",
        dateOfBirth: dobForAge(25),
        legalName: "Latecomer",
      }),
    ).rejects.toBeInstanceOf(VerificationError);
  });

  it("does not free the token while the invite is still within its 28-day window", async () => {
    const granter = await makeAccount({ ve: true });
    const t0 = new Date("2025-06-01T00:00:00Z");
    await grantPeerTokenByEmail(granter.account_id, uniqueEmail("pending"), t0);

    const within = new Date(t0.getTime() + 10 * DAY);
    expect(await reconcileExpiredPeerTokenGrants(granter.account_id, within)).toBe(false);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: granter.account_id } })).ve_token_available,
    ).toBe(false);
  });

  it("rejects a grant (direct or by-email) to an ESS-latched recipient", async () => {
    const granter = await makeAccount({ ve: true });
    const latched = await makeAccount({ ve: true, email: uniqueEmail("latched") });
    // Latch the recipient's ESS (revokes their VE).
    await lockStandingScoreDirectly({ accountId: latched.account_id, scoreType: "ESS", eventType: "lock" });

    // Direct grant is rejected — no silent ve_status restore.
    await expect(grantPeerToken(granter.account_id, latched.account_id)).rejects.toBeInstanceOf(
      VerificationError,
    );
    // The by-email entry point routes to the instant path for an existing
    // account and is rejected too.
    await expect(grantPeerTokenByEmail(granter.account_id, latched.email!)).rejects.toBeInstanceOf(
      VerificationError,
    );
    // ve_status stayed false throughout.
    expect(
      (await db.account.findUniqueOrThrow({ where: { account_id: latched.account_id } })).ve_status,
    ).toBe(false);
  });

  it("lets a granter grant again after a lapsed invite is reconciled (no double-free)", async () => {
    const granter = await makeAccount({ ve: true });
    const other = await makeAccount();
    const t0 = new Date("2025-07-01T00:00:00Z");
    await grantPeerTokenByEmail(granter.account_id, uniqueEmail("lapsed"), t0);

    // 30 days later, grant instantly to an existing account — the lapsed invite
    // is reconciled inside grantPeerToken, freeing the token for this grant.
    const later = new Date(t0.getTime() + 30 * DAY);
    await grantPeerToken(granter.account_id, other.account_id, later);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: other.account_id } })).ve_status,
    ).toBe(true);
    // Token consumed by the new grant; a re-reconcile must NOT free it again
    // (the most recent grant is the fresh instant one, not the lapsed invite).
    expect(await reconcileExpiredPeerTokenGrants(granter.account_id, later)).toBe(false);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: granter.account_id } })).ve_token_available,
    ).toBe(false);
  });
});
