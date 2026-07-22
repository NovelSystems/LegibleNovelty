import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  changeDisplayName,
  DisplayNameTakenError,
  login,
  LoginError,
  logout,
  requestPasswordReset,
  resetPassword,
  signup,
  verifyEmail,
} from "@/lib/accounts";
import { uniqueEmail, uniqueName, dobForAge } from "./helpers/factory";
import { waitForMessageTo } from "./helpers/mailpit";

// Core authentication flows end to end against the real Account schema (brief
// Task 2), with verification and reset emails asserted in Mailpit.

describe("Core authentication (Task 2)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("signs up, sends a verification email, and verifies", async () => {
    const email = uniqueEmail("signup");
    const account = await signup({
      email,
      password: "hunter2 hunter2",
      dateOfBirth: dobForAge(25),
      legalName: uniqueName("Signup"),
    });
    expect(account.account_status).toBe("active");
    expect(account.email_verified).toBeNull();
    expect(account.email_hash).toBeTruthy();
    expect(account.password_hash).not.toBe("hunter2 hunter2"); // hashed

    // Verification email visible in Mailpit.
    const msg = await waitForMessageTo(email);
    expect(msg).toBeTruthy();
    expect(msg!.Subject).toMatch(/verify/i);

    // Consume the verification token.
    const token = await prisma.accountToken.findFirstOrThrow({
      where: { account_id: account.account_id, type: "email_verification" },
    });
    expect(await verifyEmail(token.token)).toBe(true);
    const verified = await prisma.account.findUniqueOrThrow({
      where: { account_id: account.account_id },
    });
    expect(verified.email_verified).not.toBeNull();
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const email = uniqueEmail("login");
    const password = "correct battery staple";
    await signup({
      email,
      password,
      dateOfBirth: dobForAge(40),
      legalName: uniqueName("Login"),
    });

    await expect(login(email, "wrong password")).rejects.toBeInstanceOf(LoginError);

    const token = await login(email, password);
    const session = await prisma.session.findUnique({
      where: { session_token: token },
    });
    expect(session).not.toBeNull();

    // Logout revokes the session.
    await logout(token);
    expect(
      await prisma.session.findUnique({ where: { session_token: token } }),
    ).toBeNull();
  });

  it("runs the ordinary password reset flow and revokes sessions", async () => {
    const email = uniqueEmail("reset");
    await signup({
      email,
      password: "old password value",
      dateOfBirth: dobForAge(33),
      legalName: uniqueName("Reset"),
    });
    const liveSession = await login(email, "old password value");

    expect(await requestPasswordReset(email)).toBe(true);
    const resetMsg = await waitForMessagesToSubject(email, /reset/i);
    expect(resetMsg).toBe(true);

    const token = await prisma.accountToken.findFirstOrThrow({
      where: { type: "password_reset", target_email: email },
    });
    expect(await resetPassword(token.token, "brand new password")).toBe(true);

    // Old session revoked, old password fails, new password works.
    expect(
      await prisma.session.findUnique({ where: { session_token: liveSession } }),
    ).toBeNull();
    await expect(login(email, "old password value")).rejects.toBeInstanceOf(
      LoginError,
    );
    await expect(login(email, "brand new password")).resolves.toBeTruthy();
  });

  it("blocks display-name reuse at signup and at rename", async () => {
    const sharedName = uniqueName("Shared");
    await signup({
      email: uniqueEmail("first"),
      password: "password one two",
      dateOfBirth: dobForAge(29),
      legalName: sharedName,
    });

    // Trigger point 1: a NEW signup with the same display name is blocked.
    await expect(
      signup({
        email: uniqueEmail("second"),
        password: "password three four",
        dateOfBirth: dobForAge(31),
        legalName: sharedName,
      }),
    ).rejects.toBeInstanceOf(DisplayNameTakenError);

    // Trigger point 2: an existing account renaming INTO a taken name is blocked.
    const mover = await signup({
      email: uniqueEmail("mover"),
      password: "password five six",
      dateOfBirth: dobForAge(28),
      legalName: uniqueName("Mover"),
    });
    await expect(
      changeDisplayName(mover.account_id, sharedName),
    ).rejects.toBeInstanceOf(DisplayNameTakenError);
  });
});

// Small local helper: assert a message to `address` with a subject matching re.
async function waitForMessagesToSubject(
  address: string,
  re: RegExp,
): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    const msg = await waitForMessageTo(address);
    if (msg && re.test(msg.Subject)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}
