import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Auth.js configured with the standard Prisma session adapter and DATABASE
// sessions (not JWT). Database sessions are revocable, which Stage 1's
// account-deletion and parent/child access-revocation flows depend on.
//
// The email provider points at the local Mailpit catcher for development. In
// production this becomes a config swap to Resend, not new code — the adapter
// pattern is what keeps that swap (and a future Redis session store) cheap.
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
