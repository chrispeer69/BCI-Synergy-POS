"use client";

import { useState } from "react";

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Sign-in failed");
      window.location.assign("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <label>
        <span className="field-label">Email</span>
        <input name="email" type="email" autoComplete="username" required className="input" autoFocus />
      </label>
      <label>
        <span className="field-label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {err && <div className="down mono" style={{ fontSize: 11 }}>{err}</div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
