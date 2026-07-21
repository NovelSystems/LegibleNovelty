import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";

// Proves the Stage 0 acceptance criterion: a test email sent through the local
// catcher is captured and inspectable. Mailpit's REST API is built for exactly
// this kind of automated assertion on sent-email content, so tests can verify
// real templates/config rather than mocking the email layer.

const SMTP_HOST = process.env.SMTP_HOST ?? "mailpit";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "1025");
const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? "http://mailpit:8025";

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string; Name: string }>;
}

describe("Mailpit local email catcher", () => {
  it("captures a sent email and exposes it via the REST API", async () => {
    // Start from a clean mailbox so we assert on our own message.
    await fetch(`${MAILPIT_API_URL}/api/v1/messages`, { method: "DELETE" });

    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
    });

    const subject = `Stage 0 Mailpit check ${randomUUID()}`;
    const recipient = "recipient@example.com";

    await transport.sendMail({
      from: "no-reply@legiblenovelty.local",
      to: recipient,
      subject,
      text: "Legible Novelty Stage 0 email-catcher test.",
    });

    // Mailpit ingests asynchronously; poll its REST API briefly.
    let found: MailpitMessage | undefined;
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = await fetch(`${MAILPIT_API_URL}/api/v1/messages`);
      const data = (await res.json()) as { messages: MailpitMessage[] };
      found = data.messages?.find((m) => m.Subject === subject);
      if (found) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(found).toBeTruthy();
    expect(found!.To[0].Address).toBe(recipient);
  });
});
