import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { grantPeerToken } from "@/lib/verification";
import {
  confirmFlag,
  flagBadPeerTokenGrant,
  flagVeConductReview,
  initiateConductReview,
  secondaryConfirmConductReview,
  secondaryDismissConductReview,
  revokeVeStatus,
  FlagError,
} from "@/lib/flags";
import { isScoreLocked } from "@/lib/standing-scores";
import { makeAccount } from "./helpers/factory";

describe("Peer token accountability (Task 7) — the two paths differ", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("confirming bad_peer_token_grant auto-revokes the RECIPIENT's ve_status", async () => {
    const granter = await makeAccount({ ve: true });
    const recipient = await makeAccount();
    const moderator = await makeAccount();

    const grant = await grantPeerToken(granter.account_id, recipient.account_id);
    // Recipient legitimately holds VE for now.
    expect(
      (await prisma.account.findUniqueOrThrow({
        where: { account_id: recipient.account_id },
      })).ve_status,
    ).toBe(true);

    const flag = await flagBadPeerTokenGrant({
      tokenGrantId: grant.grant_id,
      reason: "Recipient turned out to be unqualified.",
    });
    // The flag is against the GRANTING educator and points at the grant.
    expect(flag.account_id).toBe(granter.account_id);
    expect(flag.related_token_grant_id).toBe(grant.grant_id);

    await confirmFlag(flag.flag_id, moderator.account_id);

    // Automatic correction: the recipient's ve_status flips to false.
    const recipAfter = await prisma.account.findUniqueOrThrow({
      where: { account_id: recipient.account_id },
    });
    expect(recipAfter.ve_status).toBe(false);
  });

  it("ve_conduct_review requires TWO distinct moderators to trigger the ESS lock", async () => {
    // A ve_conduct_review is now a two-moderator flow. confirmFlag rejects it.
    const educator = await makeAccount({ ve: true });
    await prisma.account.update({ where: { account_id: educator.account_id }, data: { lnc_status: true } });
    const primary = await makeAccount();
    const secondary = await makeAccount();

    const flag = await flagVeConductReview({
      accountId: educator.account_id,
      reason: "Conduct concern raised.",
    });
    await expect(confirmFlag(flag.flag_id, primary.account_id)).rejects.toBeInstanceOf(FlagError);

    // Primary initiates — a single moderator's review alone does NOT lock ESS.
    await initiateConductReview(flag.flag_id, primary.account_id);
    let after = await prisma.account.findUniqueOrThrow({ where: { account_id: educator.account_id } });
    expect(after.ve_status).toBe(true);
    expect(await isScoreLocked(educator.account_id, "ESS")).toBe(false);

    // The secondary must be a DIFFERENT moderator.
    await expect(
      secondaryConfirmConductReview(flag.flag_id, primary.account_id),
    ).rejects.toBeInstanceOf(FlagError);

    // A distinct secondary confirming → ESS lock fires (ve/lnc revoked).
    await secondaryConfirmConductReview(flag.flag_id, secondary.account_id);
    after = await prisma.account.findUniqueOrThrow({ where: { account_id: educator.account_id } });
    expect(after.ve_status).toBe(false);
    expect(after.lnc_status).toBe(false);
    expect(await isScoreLocked(educator.account_id, "ESS")).toBe(true);

    const resolved = await prisma.accountFlag.findUniqueOrThrow({ where: { flag_id: flag.flag_id } });
    expect(resolved.status).toBe("confirmed");
    expect(resolved.reviewed_by).toBe(primary.account_id);
    expect(resolved.secondary_reviewed_by).toBe(secondary.account_id);
  });

  it("a disagreeing secondary dismisses instead of locking ESS", async () => {
    const educator = await makeAccount({ ve: true });
    const primary = await makeAccount();
    const secondary = await makeAccount();
    const flag = await flagVeConductReview({ accountId: educator.account_id, reason: "Disputed." });

    await initiateConductReview(flag.flag_id, primary.account_id);
    await secondaryDismissConductReview(flag.flag_id, secondary.account_id);

    const resolved = await prisma.accountFlag.findUniqueOrThrow({ where: { flag_id: flag.flag_id } });
    expect(resolved.status).toBe("dismissed");
    // No lock, status retained.
    const after = await prisma.account.findUniqueOrThrow({ where: { account_id: educator.account_id } });
    expect(after.ve_status).toBe(true);
    expect(await isScoreLocked(educator.account_id, "ESS")).toBe(false);

    // revokeVeStatus still exists as a separate explicit action if warranted.
    await revokeVeStatus(educator.account_id);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { account_id: educator.account_id } })).ve_status,
    ).toBe(false);
  });
});
