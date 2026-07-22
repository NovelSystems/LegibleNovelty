"use server";

import { cookies } from "next/headers";
import {
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signup,
  verifyEmail,
  ReclaimRequiredError,
  LoginError,
  DisplayNameTakenError,
} from "@/lib/accounts";

// Thin server-action wrappers over the auth service layer (brief Task 2). The
// business logic and its tests live in lib/accounts.ts; these adapt it to
// Next.js forms and manage the database-session cookie.

// Auth.js v5's default database-session cookie name (dev, over http).
const SESSION_COOKIE = "authjs.session-token";

function fieldsFrom(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    preferredDisplayName: formData.get("preferredDisplayName")
      ? String(formData.get("preferredDisplayName"))
      : undefined,
    dateOfBirth: new Date(String(formData.get("dateOfBirth") ?? "")),
  };
}

export async function signupAction(formData: FormData) {
  const f = fieldsFrom(formData);
  try {
    await signup({
      email: f.email,
      password: f.password,
      dateOfBirth: f.dateOfBirth,
      legalName: f.legalName,
      preferredDisplayName: f.preferredDisplayName,
      usePreferred: Boolean(f.preferredDisplayName),
    });
    return { ok: true as const };
  } catch (err) {
    if (err instanceof ReclaimRequiredError) {
      return { ok: false as const, reason: "reclaim_required" };
    }
    if (err instanceof DisplayNameTakenError) {
      return { ok: false as const, reason: "display_name_taken" };
    }
    return { ok: false as const, reason: "error" };
  }
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const sessionToken = await login(email, password);
    const store = await cookies();
    store.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    return { ok: true as const };
  } catch (err) {
    if (err instanceof ReclaimRequiredError) {
      return { ok: false as const, reason: "reclaim_required" };
    }
    if (err instanceof LoginError) {
      return { ok: false as const, reason: err.message };
    }
    return { ok: false as const, reason: "error" };
  }
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await logout(token);
    store.delete(SESSION_COOKIE);
  }
  return { ok: true as const };
}

export async function requestPasswordResetAction(formData: FormData) {
  await requestPasswordReset(String(formData.get("email") ?? ""));
  // Always report success to avoid leaking which emails exist.
  return { ok: true as const };
}

export async function resetPasswordAction(formData: FormData) {
  const ok = await resetPassword(
    String(formData.get("token") ?? ""),
    String(formData.get("password") ?? ""),
  );
  return { ok };
}

export async function verifyEmailAction(token: string) {
  return { ok: await verifyEmail(token) };
}
