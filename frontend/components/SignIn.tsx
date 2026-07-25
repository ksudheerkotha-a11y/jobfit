"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="card" style={{ maxWidth: 380 }}>
        <p style={{ margin: 0 }}>Check {email} for a magic sign-in link.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 380 }}>
      <h2>Sign in</h2>
      <p className="hint">Get a magic link — no password to set.</p>
      <label htmlFor="email" className="stat-label" style={{ marginBottom: "0.4rem" }}>
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ marginBottom: "0.75rem" }}
      />
      <button type="submit" className="primary">
        Send magic link
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
