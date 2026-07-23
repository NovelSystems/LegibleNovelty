import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  acceptConnection,
  acceptInviteLink,
  approveParentApproval,
  areConnected,
  requestConnection,
  requestOneTimePass,
  requestStandingConnection,
} from "@/lib/connections";
import {
  isContactSharingAvailableForActor,
  shareContactInformation,
  ContactShareError,
} from "@/lib/contact";
import { createChildSubAccount } from "@/lib/lifecycle";
import { dobForAge, makeAccount, uniqueEmail } from "./helpers/factory";

describe("Connection & ParentApproval (Task 4) + Share Contact (Task 5)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("forms a standing connection via request + accept", async () => {
    const a = await makeAccount();
    const b = await makeAccount();
    const conn = await requestConnection(a.account_id, b.account_id);
    expect(conn.status).toBe("requested");
    expect(conn.created_via).toBe("request");
    expect(await areConnected(a.account_id, b.account_id)).toBe(false);

    await acceptConnection(conn.connection_id);
    expect(await areConnected(a.account_id, b.account_id)).toBe(true);
  });

  it("keeps the two adult-to-child pathways functionally distinct", async () => {
    const parent = await makeAccount({ ageYears: 40 });
    const adult = await makeAccount({ ageYears: 38 });
    const child = await createChildSubAccount({
      parentAccountId: parent.account_id,
      dateOfBirth: dobForAge(10),
      legalName: "Kid",
      grade: 4,
      country: "Italy",
      email: uniqueEmail("pathchild"),
      password: "path kid password",
    });

    // one_time_pass → NO standing connection after approval.
    const lessonPlanId = randomUUID(); // Stubbed soft reference.
    const otp = await requestOneTimePass({
      childAccountId: child.account_id,
      requestingAdultAccountId: adult.account_id,
      lessonPlanId,
    });
    expect(otp.approval_type).toBe("one_time_pass");
    expect(otp.lesson_plan_id).toBe(lessonPlanId);
    await approveParentApproval(otp.approval_id);
    expect(await areConnected(adult.account_id, child.account_id)).toBe(false);

    // standing_connection → an accepted Connection IS created on approval.
    const sc = await requestStandingConnection({
      childAccountId: child.account_id,
      requestingAdultAccountId: adult.account_id,
    });
    expect(sc.approval_type).toBe("standing_connection");
    expect(sc.lesson_plan_id).toBeNull();
    await approveParentApproval(sc.approval_id);
    expect(await areConnected(adult.account_id, child.account_id)).toBe(true);
  });

  it("auto-accepts and auto-forms a connection via invite link (stubbed lesson plan)", async () => {
    const assigner = await makeAccount({ ageYears: 42 });
    const newcomer = await makeAccount({ ageYears: 39 });
    const lessonPlanId = randomUUID(); // Inert soft reference until Workshop.

    const result = await acceptInviteLink({
      assignerAdultAccountId: assigner.account_id,
      newAccountId: newcomer.account_id,
      lessonPlanId,
    });
    expect(result.autoAccepted).toBe(true);
    expect(result.connection.created_via).toBe("invite_link_autoaccept");
    expect(result.connection.status).toBe("accepted");
    expect(await areConnected(assigner.account_id, newcomer.account_id)).toBe(true);
  });

  it("gates Share Contact on mutual connection AND 18+/18+", async () => {
    const adultA = await makeAccount({ ageYears: 25 });
    const adultB = await makeAccount({ ageYears: 30 });

    // No connection yet → blocked even though both are adults.
    await expect(
      shareContactInformation(adultA.account_id, adultB.account_id),
    ).rejects.toBeInstanceOf(ContactShareError);

    const conn = await requestConnection(adultA.account_id, adultB.account_id);
    await acceptConnection(conn.connection_id);
    const shared = await shareContactInformation(
      adultA.account_id,
      adultB.account_id,
    );
    expect(shared.sharedEmail).toBe(adultB.email);

    // A graduated 13–17 account (17yo, standard) must be blocked AND must never
    // see the control.
    const minor = await makeAccount({ ageYears: 17 });
    expect(isContactSharingAvailableForActor(minor)).toBe(false);
    expect(isContactSharingAvailableForActor(adultA)).toBe(true);

    const connMinor = await requestConnection(adultA.account_id, minor.account_id);
    await acceptConnection(connMinor.connection_id);
    await expect(
      shareContactInformation(adultA.account_id, minor.account_id),
    ).rejects.toBeInstanceOf(ContactShareError);
  });
});
