"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export function SignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        // Email confirmation is required before the user has a session.
        setConfirmSent(true);
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) setError(error.message);
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setConfirmSent(false);
  }

  if (confirmSent) {
    return (
      <div className="card" style={{ maxWidth: 380 }}>
        <p style={{ margin: 0 }}>
          Check {email} to confirm your account, then sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 380 }}>
      <h2>{mode === "signin" ? "Sign in" : "Create an account"}</h2>
      <p className="hint">
        {mode === "signin" ? "Welcome back." : "Takes a minute — no email verification wait for future logins."}
      </p>

      <label htmlFor="email" className="stat-label" style={{ marginBottom: "0.4rem" }}>
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        style={{ marginBottom: "0.75rem" }}
      />

      <label htmlFor="password" className="stat-label" style={{ marginBottom: "0.4rem" }}>
        Password
      </label>
      <input
        id="password"
        type="password"
        required
        minLength={6}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
        style={{ marginBottom: "0.75rem" }}
      />

      <button type="submit" className="primary" disabled={submitting} style={{ width: "100%", marginBottom: "0.75rem" }}>
        {submitting ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
      </button>

      <button type="button" className="ghost" onClick={toggleMode} style={{ width: "100%" }}>
        {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>

      {error && <p className="error">{error}</p>}
    </form>
  );
}
