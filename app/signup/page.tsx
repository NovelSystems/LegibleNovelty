"use client";

import { useState } from "react";
import { signupAction } from "@/app/actions/auth";

// Minimal signup surface (brief Task 2). Collects email, password, date of
// birth (required for every account), legal name and an optional preferred
// display name. The real logic and its tests live in lib/accounts.ts.
export default function SignupPage() {
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await signupAction(new FormData(e.currentTarget));
    if (result.ok) {
      setMessage("Account created. Check your email to verify your address.");
    } else if (result.reason === "reclaim_required") {
      setMessage("This email belongs to a purged account — use the reclaim flow.");
    } else if (result.reason === "display_name_taken") {
      setMessage("That display name is not available.");
    } else {
      setMessage("Could not create the account.");
    }
  }

  return (
    <main>
      <h1>Create an account</h1>
      <form onSubmit={handleSubmit}>
        <label>Email<input name="email" type="email" required /></label>
        <label>Password<input name="password" type="password" required /></label>
        <label>Date of birth<input name="dateOfBirth" type="date" required /></label>
        <label>Legal name<input name="legalName" type="text" required /></label>
        <label>
          Preferred display name (optional)
          <input name="preferredDisplayName" type="text" />
        </label>
        <button type="submit">Sign up</button>
      </form>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
