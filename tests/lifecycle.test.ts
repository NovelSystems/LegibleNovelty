import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { signup, DisplayNameTakenError } from "@/lib/accounts";
import {
  beginReclaim,
  ReclaimError,
  childLoginBlockedByParent,
  childPublicIdentity,
  completeReclaim,
  createChildSubAccount,
  deactivateAccount,
  processGraduations,
  purgeAccount,
  reactivateAccount,
  warnAndDeleteParent,
} from "@/lib/lifecycle";
import { dobForAge, makeAccount, uniqueEmail, uniqueName } from "./helpers/factory";
import { waitForMessagesTo } from "./helpers/mailpit";

describe("Account lifecycle (Task 3)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a child sub-account with a name-free public identity", async () => {
    const parent = await makeAccount({ ageYears: 40 });
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(9),
      legalName: "Never Displayed",
      grade: 3,
      country: "Canada",
    });
    expect(child.is_child_subaccount).toBe(true);
    expect(child.email).toBeNull();
    const identity = childPublicIdentity(child);
    expect(identity).toContain("Canada");
    expect(identity).not.toContain("Never Displayed");
  });

  it("graduates a child at 13 and notifies (Task 10 trigger)", async () => {
    const parentEmail = uniqueEmail("gradparent");
    const parent = await makeAccount({ email: parentEmail, ageYears: 45 });
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(13), // Reached the 13th birthday.
      legalName: "Grad Kid",
      grade: 8,
      country: "Ireland",
    });

    const graduated = await processGraduations();
    expect(graduated).toContain(child.account_id);

    const after = await prisma.account.findUniqueOrThrow({
      where: { account_id: child.account_id },
    });
    expect(after.is_child_subaccount).toBe(false); // Now a standard account.

    // Graduation email delivered to the managing parent.
    const msgs = await waitForMessagesTo(parentEmail);
    expect(msgs.some((m) => /graduat/i.test(m.Subject))).toBe(true);
  });

  it("warns on parent deletion and holds an under-13 child's login", async () => {
    const parentEmail = uniqueEmail("delparent");
    const parent = await makeAccount({ email: parentEmail, ageYears: 50 });
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(8),
      legalName: "Held Kid",
      grade: 2,
      country: "Spain",
    });

    await warnAndDeleteParent(parent.account_id, "deactivate");

    // Warning email fired (Task 10 trigger).
    const msgs = await waitForMessagesTo(parentEmail);
    expect(msgs.some((m) => /deletion|child/i.test(m.Subject))).toBe(true);

    const deadParent = await prisma.account.findUniqueOrThrow({
      where: { account_id: parent.account_id },
    });
    expect(deadParent.account_status).toBe("deactivated");

    // Under-13 child is blocked from new logins during the holding state.
    expect(childLoginBlockedByParent(child, deadParent)).toBe(true);
  });

  it("deactivates and reactivates without data loss", async () => {
    const account = await makeAccount({ ageYears: 22 });
    await deactivateAccount(account.account_id);
    let a = await prisma.account.findUniqueOrThrow({
      where: { account_id: account.account_id },
    });
    expect(a.account_status).toBe("deactivated");
    expect(a.deactivated_at).not.toBeNull();
    expect(a.email).toBe(account.email); // Data intact.

    await reactivateAccount(account.account_id);
    a = await prisma.account.findUniqueOrThrow({
      where: { account_id: account.account_id },
    });
    expect(a.account_status).toBe("active");
    expect(a.deactivated_at).toBeNull();
  });

  it("purges with the exact field-handling split", async () => {
    const account = await makeAccount({ ageYears: 35 });
    const originalHash = account.display_name_hash;
    await prisma.account.update({
      where: { account_id: account.account_id },
      data: { country: "France", grade: 5, interest_domains: ["math"] },
    });

    const pseudonym = await purgeAccount(account.account_id);
    const purged = await prisma.account.findUniqueOrThrow({
      where: { account_id: account.account_id },
    });

    // Retained in the clear.
    expect(purged.account_id).toBe(account.account_id);
    expect(purged.purged_pseudonymous_identifier).toBe(pseudonym);
    expect(purged.account_status).toBe("purged");
    // Deleted / overwritten PII.
    expect(purged.email).toBeNull();
    expect(purged.date_of_birth).toBeNull();
    expect(purged.country).toBeNull();
    expect(purged.grade).toBeNull();
    expect(purged.preferred_display_name).toBeNull();
    expect(purged.legal_name).toBe(pseudonym);
    expect(purged.interest_domains).toEqual([]);
    // Retained hashed only.
    expect(purged.email_hash).toBe(account.email_hash);
    expect(purged.password_hash).toBe(account.password_hash);
    // Old handle permanently retired.
    const retired = await prisma.retiredDisplayName.findUnique({
      where: { hash: originalHash! },
    });
    expect(retired).not.toBeNull();
  });

  it("reclaims a purged account and keeps the old handle blocked (Task 3)", async () => {
    const email = uniqueEmail("reclaim");
    const oldName = uniqueName("OldHandle");
    const created = await signup({
      email,
      password: "reclaim me please",
      dateOfBirth: dobForAge(30),
      legalName: oldName,
    });
    await purgeAccount(created.account_id);

    // Trigger point 3: display-name reuse is blocked platform-wide even for a
    // fresh signup trying to take the purged handle.
    await expect(
      signup({
        email: uniqueEmail("thief"),
        password: "not your name",
        dateOfBirth: dobForAge(20),
        legalName: oldName,
      }),
    ).rejects.toBeInstanceOf(DisplayNameTakenError);

    // Wrong old password → reclaim fails (no reset path for a purged account).
    await expect(beginReclaim(email, "wrong password")).rejects.toBeInstanceOf(
      ReclaimError,
    );

    // Correct old password → reclaim token issued + email sent.
    const token = await beginReclaim(email, "reclaim me please");
    const msgs = await waitForMessagesTo(email);
    expect(msgs.some((m) => /reclaim/i.test(m.Subject))).toBe(true);

    // Reclaim cannot re-take the old handle.
    await expect(
      completeReclaim({
        token,
        newDisplayName: oldName,
        dateOfBirth: dobForAge(31),
      }),
    ).rejects.toBeInstanceOf(DisplayNameTakenError);

    // A genuinely new handle succeeds and restores the account.
    const restored = await completeReclaim({
      token,
      newDisplayName: uniqueName("NewHandle"),
      dateOfBirth: dobForAge(31),
    });
    expect(restored.account_status).toBe("active");
    expect(restored.email).toBe(email);
    expect(restored.date_of_birth).not.toBeNull();
  });
});
