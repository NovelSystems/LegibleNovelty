import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";

// Proves the core Stage 0 acceptance criterion: Auth.js can create and revoke a
// database-backed session against a placeholder user record, running against
// the dockerized Postgres. This uses the standard @auth/prisma-adapter methods
// (not custom logic), exactly as the app wires them up in auth.ts.
//
// Runs against DATABASE_URL, which check.sh overrides to TEST_DATABASE_URL.
const prisma = new PrismaClient();
const adapter = PrismaAdapter(prisma);

describe("Auth.js database-session adapter", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates and then revokes a database-backed session", async () => {
    // A placeholder/test user record.
    const user = await adapter.createUser!({
      id: randomUUID(),
      email: `placeholder-${randomUUID()}@example.com`,
      emailVerified: null,
      name: "Placeholder User",
    });

    const sessionToken = randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    // Create the session (login).
    await adapter.createSession!({ sessionToken, userId: user.id, expires });

    // The session is retrievable and linked to the user.
    const active = await adapter.getSessionAndUser!(sessionToken);
    expect(active).not.toBeNull();
    expect(active!.session.sessionToken).toBe(sessionToken);
    expect(active!.user.id).toBe(user.id);

    // Revoke the session (the revocability database sessions give us).
    await adapter.deleteSession!(sessionToken);

    // It is gone.
    const revoked = await adapter.getSessionAndUser!(sessionToken);
    expect(revoked).toBeNull();

    // Clean up the placeholder user.
    await prisma.user.delete({ where: { id: user.id } });
  });
});
