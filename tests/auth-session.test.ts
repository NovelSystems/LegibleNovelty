import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { AccountPrismaAdapter } from "@/lib/auth-adapter";

// Stage 0's acceptance criterion, carried forward against the REAL schema:
// Auth.js can create and revoke a database-backed session — now through the
// Account-backed adapter (lib/auth-adapter.ts) instead of the removed
// placeholder User model. Runs against DATABASE_URL (check.sh points this at
// TEST_DATABASE_URL).
const prisma = new PrismaClient();
const adapter = AccountPrismaAdapter(prisma);

describe("Auth.js database-session adapter (Account-backed)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates and then revokes a database-backed session", async () => {
    const user = await adapter.createUser!({
      id: randomUUID(),
      email: `placeholder-${randomUUID()}@example.com`,
      emailVerified: null,
    });

    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await adapter.createSession!({ sessionToken, userId: user.id, expires });

    const active = await adapter.getSessionAndUser!(sessionToken);
    expect(active).not.toBeNull();
    expect(active!.session.sessionToken).toBe(sessionToken);
    expect(active!.user.id).toBe(user.id);

    await adapter.deleteSession!(sessionToken);

    const revoked = await adapter.getSessionAndUser!(sessionToken);
    expect(revoked).toBeNull();

    await prisma.account.delete({ where: { account_id: user.id } });
  });
});
