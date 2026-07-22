// Mailpit REST helpers for asserting on sent emails. Tests use unique recipient
// addresses (per randomUUID) and filter the shared mailbox by recipient, rather
// than clearing it — so serial test files never clobber each other's mail.

const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? "http://mailpit:8025";

export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string; Name: string }>;
}

async function listMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${MAILPIT_API_URL}/api/v1/messages?limit=500`);
  const data = (await res.json()) as { messages: MailpitMessage[] };
  return data.messages ?? [];
}

// Poll until at least `min` messages addressed to `address` exist; returns them.
export async function waitForMessagesTo(
  address: string,
  min = 1,
  attempts = 60,
): Promise<MailpitMessage[]> {
  for (let i = 0; i < attempts; i++) {
    const all = await listMessages();
    const mine = all.filter((m) => m.To.some((t) => t.Address === address));
    if (mine.length >= min) return mine;
    await new Promise((r) => setTimeout(r, 200));
  }
  return [];
}

export async function waitForMessageTo(
  address: string,
): Promise<MailpitMessage | undefined> {
  const msgs = await waitForMessagesTo(address, 1);
  return msgs[0];
}
