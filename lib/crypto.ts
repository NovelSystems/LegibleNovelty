import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

// Identity hashing helpers for the Account model.
//
// Two different jobs, two different primitives:
//  * Passwords use bcrypt (slow, salted) — they must survive an offline attack.
//  * email_hash / display_name_hash are lookup/blocklist keys, not secrets to
//    be brute-force-resistant against; they must be *deterministic* so the same
//    input always maps to the same stored value (reclaim lookup, reuse
//    blocking). SHA-256 over a normalized input is the right tool. A per-row
//    salt would defeat the whole point (you could no longer look up "does this
//    email/name already exist?").

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

// Email is normalized (trimmed + lowercased) before hashing so trivial casing
// differences don't defeat reclaim lookup / duplicate detection.
export function hashEmail(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

// Display-name reuse blocking is case-insensitive and whitespace-insensitive:
// "Ada Lovelace" and "ada  lovelace" collapse to the same block key so a purged
// handle can't be trivially re-taken with a cosmetic tweak.
export function hashDisplayName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

// Opaque, unguessable identifier generated at purge time. Deliberately not
// derived from account_id or email (brief Task 1) — a fresh random value so it
// leaks nothing about the pre-purge identity.
export function generatePseudonymousIdentifier(): string {
  return `anon-${randomBytes(16).toString("hex")}`;
}

// Single-use URL-safe token for email verification / password reset / reclaim.
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function newId(): string {
  return randomUUID();
}
