"use client";

import { useState } from "react";
import { loginAction } from "@/app/actions/auth";

// Minimal login surface (brief Task 2), against database sessions. The service
// layer (lib/accounts.ts) creates the Session row; loginAction sets the cookie.
export default function LoginPage() {
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await loginAction(new FormData(e.currentTarget));
    if (result.ok) {
      setMessage("Logged in.");
    } else if (result.reason === "reclaim_required") {
      setMessage("This email belongs to a purged account — use the reclaim flow.");
    } else {
      setMessage(result.reason ?? "Could not log in.");
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label>Email<input name="email" type="email" required /></label>
        <label>Password<input name="password" type="password" required /></label>
        <button type="submit">Log in</button>
      </form>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
