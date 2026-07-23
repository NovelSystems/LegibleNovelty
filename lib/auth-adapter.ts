import type { Adapter, AdapterUser, AdapterSession } from "next-auth/adapters";
import type { PrismaClient, Account } from "@prisma/client";

// Custom Auth.js adapter backed by the real `Account` model (Stage 1 folds
// Stage 0's placeholder `User` into `Account`, the single identity table). This
// keeps database-backed session resolution — `auth()` reads the session cookie
// and resolves it through `getSessionAndUser` — while letting `Account` carry
// all of Task 1's fields.
//
// Stage 1's own auth flows (password signup/login, email verification, reset,
// reclaim) are custom and do NOT route through Auth.js's provider machinery, so
// the OAuth-linking methods here are inert stubs. The methods that matter for a
// database session (session CRUD, user lookup, verification tokens) are real.

function toAdapterUser(a: Account): AdapterUser {
  return {
    id: a.account_id,
    // AdapterUser.email is typed non-null; a purged account has no plaintext
    // email, which surfaces here as an empty string (such accounts never resolve
    // a live session anyway).
    email: a.email ?? "",
    emailVerified: a.email_verified,
    name: a.preferred_display_name ?? a.legal_name,
  };
}

export function AccountPrismaAdapter(prisma: PrismaClient): Adapter {
  return {
    async createUser(user) {
      const created = await prisma.account.create({
        data: {
          account_id: user.id,
          email: user.email || null,
          email_verified: user.emailVerified ?? null,
          // Auth.js-created users are not the real signup path; fill required
          // columns permissively.
          legal_name: user.name ?? user.email ?? "account",
        },
      });
      return toAdapterUser(created);
    },

    async getUser(id) {
      const a = await prisma.account.findUnique({ where: { account_id: id } });
      return a ? toAdapterUser(a) : null;
    },

    async getUserByEmail(email) {
      const a = await prisma.account.findUnique({ where: { email } });
      return a ? toAdapterUser(a) : null;
    },

    // No OAuth in Stage 1.
    async getUserByAccount() {
      return null;
    },

    async updateUser(user) {
      const a = await prisma.account.update({
        where: { account_id: user.id },
        data: {
          email: user.email || undefined,
          email_verified: user.emailVerified ?? undefined,
        },
      });
      return toAdapterUser(a);
    },

    async deleteUser(id) {
      await prisma.account.delete({ where: { account_id: id } });
    },

    // OAuth account linking is unused in Stage 1 (email/password only).
    async linkAccount() {
      return undefined;
    },
    async unlinkAccount() {
      return undefined;
    },

    async createSession(session) {
      const created = await prisma.session.create({
        data: {
          session_token: session.sessionToken,
          account_id: session.userId,
          expires: session.expires,
        },
      });
      return {
        sessionToken: created.session_token,
        userId: created.account_id,
        expires: created.expires,
      } satisfies AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const row = await prisma.session.findUnique({
        where: { session_token: sessionToken },
        include: { account: true },
      });
      if (!row) return null;
      return {
        session: {
          sessionToken: row.session_token,
          userId: row.account_id,
          expires: row.expires,
        },
        user: toAdapterUser(row.account),
      };
    },

    async updateSession(session) {
      const updated = await prisma.session.update({
        where: { session_token: session.sessionToken },
        data: { expires: session.expires },
      });
      return {
        sessionToken: updated.session_token,
        userId: updated.account_id,
        expires: updated.expires,
      } satisfies AdapterSession;
    },

    async deleteSession(sessionToken) {
      await prisma.session
        .delete({ where: { session_token: sessionToken } })
        .catch(() => undefined);
    },

    async createVerificationToken(token) {
      const created = await prisma.verificationToken.create({ data: token });
      return created;
    },

    async useVerificationToken({ identifier, token }) {
      try {
        return await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token } },
        });
      } catch {
        return null;
      }
    },
  };
}
