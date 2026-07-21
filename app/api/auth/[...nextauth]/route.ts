import { handlers } from "@/auth";

// Auth.js talks to Prisma/Postgres and Nodemailer, so this route must run on
// the Node.js runtime, not the Edge runtime.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
