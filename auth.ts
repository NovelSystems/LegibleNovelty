import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { prisma } from "@/lib/prisma";
import { AccountPrismaAdapter } from "@/lib/auth-adapter";

// Auth.js configured with DATABASE sessions (not JWT), matching Stage 0.
// Database sessions are revocable, which Stage 1's account-deletion and
// parent/child access-revocation flows depend on.
//
// Stage 1 change: the adapter is now backed by the real `Account` model (via
// AccountPrismaAdapter) rather than Stage 0's placeholder `User`. Session
// resolution — `auth()` reading the session cookie — flows through it.
//
// The Nodemailer provider still points at Mailpit in dev (a Resend config swap
// in production). Stage 1's actual auth flows (password signup/login, email
// verification, password reset, reclaim) are custom services in lib/ that use
// the same Nodemailer transport (lib/mail.ts); they do not depend on this
// provider being exercised, but it is kept configured to match Stage 0.
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: AccountPrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST ?? "mailpit",
        port: Number(process.env.SMTP_PORT ?? "1025"),
      },
      from: process.env.EMAIL_FROM ?? "no-reply@legiblenovelty.local",
    }),
  ],
});
