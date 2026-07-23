import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  signup,
  login,
  DisplayNameTakenError,
  ChildAccessBlockedError,
} from "@/lib/accounts";
import {
  beginReclaim,
  ReclaimError,
  ChildAgeError,
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

  it("creates a standalone child sub-account with its own credentials and a name-free public identity", async () => {
    const parent = await makeAccount({ ageYears: 40 });
    const childEmail = uniqueEmail("child");
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(9),
      legalName: "Never Displayed",
      grade: 3,
      country: "Canada",
      email: childEmail,
      password: "child own password",
    });
    expect(child.is_child_subaccount).toBe(true);
    expect(child.parent_account_id).toBe(parent.account_id);
    // A fully standalone account with its OWN independent login credentials
    // (not a profile switched into from the parent's session).
    expect(child.email).toBe(childEmail);
    expect(child.email_hash).toBeTruthy();
    expect(child.password_hash).toBeTruthy();
    // Public identity is still name-free.
    const identity = childPublicIdentity(child);
    expect(identity).toContain("Canada");
    expect(identity).not.toContain("Never Displayed");

    // The child can log in independently with its own credentials.
    const token = await login(childEmail, "child own password");
    expect(token).toBeTruthy();
  });

  it("puts multiple children under one parent via parent_account_id alone (no grouping entity)", async () => {
    const parent = await makeAccount({ ageYears: 44 });
    const childA = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(7),
      legalName: "Kid A",
      grade: 1,
      country: "Peru",
      email: uniqueEmail("kidA"),
      password: "kid a password",
    });
    const childB = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(11),
      legalName: "Kid B",
      grade: 5,
      country: "Peru",
      email: uniqueEmail("kidB"),
      password: "kid b password",
    });
    const siblings = await prisma.account.findMany({
      where: { parent_account_id: parent.account_id },
      select: { account_id: true },
    });
    const ids = siblings.map((s) => s.account_id);
    expect(ids).toContain(childA.account_id);
    expect(ids).toContain(childB.account_id);
    expect(ids).toHaveLength(2);
  });

  it("rejects creating a child sub-account at 13 or older", async () => {
    const parent = await makeAccount({ ageYears: 45 });
    // A 13-year-old belongs in the graduated minor state, not child mode — the
    // creation path must reject it rather than mint a child account.
    await expect(
      createChildSubAccount({
        parentAccountId: parent.account_id,
        dateOfBirth: dobForAge(13),
        legalName: "Too Old",
        grade: 8,
        country: "Ireland",
        email: uniqueEmail("tooold"),
        password: "too old password",
      }),
    ).rejects.toBeInstanceOf(ChildAgeError);
  });

  it("graduates a child at 13 on the next login check (Task 10 trigger)", async () => {
    const parent = await makeAccount({ ageYears: 45 });
    const childEmail = uniqueEmail("gradchild");
    // Create a GENUINE under-13 child through the guarded creation path.
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(12),
      legalName: "Grad Kid",
      grade: 8,
      country: "Ireland",
      email: childEmail,
      password: "grad kid password",
    });
    expect(child.is_child_subaccount).toBe(true);

    // Reach the 13th birthday by patching the stored DOB directly — a fixture
    // shortcut that deliberately bypasses the creation-path guard (which exists
    // only to reject minting a child account at 13+, not to freeze an existing
    // child's clock).
    await prisma.account.update({
      where: { account_id: child.account_id },
      data: { date_of_birth: dobForAge(13) },
    });

    // The next login check triggers automatic graduation.
    const token = await login(childEmail, "grad kid password");
    expect(token).toBeTruthy();

    const after = await prisma.account.findUniqueOrThrow({
      where: { account_id: child.account_id },
    });
    expect(after.is_child_subaccount).toBe(false); // Now a standard account.

    // Graduation email delivered to the child's own account.
    const msgs = await waitForMessagesTo(childEmail);
    expect(msgs.some((m) => /graduat/i.test(m.Subject))).toBe(true);
  });

  it("also graduates a due child via the processGraduations batch path", async () => {
    const parent = await makeAccount({ ageYears: 46 });
    const childEmail = uniqueEmail("batchgrad");
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(11),
      legalName: "Batch Kid",
      grade: 6,
      country: "Portugal",
      email: childEmail,
      password: "batch kid password",
    });
    await prisma.account.update({
      where: { account_id: child.account_id },
      data: { date_of_birth: dobForAge(13) },
    });

    const graduated = await processGraduations();
    expect(graduated).toContain(child.account_id);
    const after = await prisma.account.findUniqueOrThrow({
      where: { account_id: child.account_id },
    });
    expect(after.is_child_subaccount).toBe(false);
  });

  it("warns on parent deletion and holds an under-13 child's own login", async () => {
    const parentEmail = uniqueEmail("delparent");
    const parent = await makeAccount({ email: parentEmail, ageYears: 50 });
    const childEmail = uniqueEmail("heldchild");
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(8),
      legalName: "Held Kid",
      grade: 2,
      country: "Spain",
      email: childEmail,
      password: "held kid password",
    });

    // Before deletion the child can log in with its own credentials.
    await expect(login(childEmail, "held kid password")).resolves.toBeTruthy();

    await warnAndDeleteParent(parent.account_id, "deactivate");

    // Warning email fired (Task 10 trigger).
    const msgs = await waitForMessagesTo(parentEmail);
    expect(msgs.some((m) => /deletion|child/i.test(m.Subject))).toBe(true);

    const deadParent = await prisma.account.findUniqueOrThrow({
      where: { account_id: parent.account_id },
    });
    expect(deadParent.account_status).toBe("deactivated");

    // Under-13 child is now blocked from NEW logins during the holding state —
    // both the predicate and the actual login path enforce it.
    expect(childLoginBlockedByParent(child, deadParent)).toBe(true);
    await expect(login(childEmail, "held kid password")).rejects.toBeInstanceOf(
      ChildAccessBlockedError,
    );
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
