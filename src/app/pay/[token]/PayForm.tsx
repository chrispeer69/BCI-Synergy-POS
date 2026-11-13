"use client";

import { useState } from "react";

type Result = { status: string; totalAmountCents: number; feeLabel?: string | null; last4?: string; brand?: string; failureReason?: string };

const MOCK_TOKENS = [
  { v: "tok_credit_4242", l: "Test · Visa credit ••4242" },
  { v: "tok_debit_5555", l: "Test · Debit ••5555" },
  { v: "tok_ach_6789", l: "Test · Bank (ACH) ••6789" },
  { v: "tok_decline_0002", l: "Test · Decline ••0002" },
];

/**
 * Production: mount the provider's hosted fields (Tilled.js / Finix.js) into #card-element,
 * tokenize in the browser, and POST only the resulting token. Card data never hits our servers.
 */
export function PayForm({ token, provider, env }: { token: string; provider: string; env: string }) {
  const [pm, setPm] = useState(MOCK_TOKENS[0].v);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const paymentMethodToken = provider === "mock" ? pm : await tokenizeWithProvider();
      const r = await fetch(`/api/pay/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentMethodToken }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Payment failed");
      setRes(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (res?.status === "SUCCEEDED" || res?.status === "PROCESSING") {
    return (
      <div className="result" style={{ padding: "8px 0" }}>
        <div className="field-label">{res.status === "SUCCEEDED" ? "Payment approved" : "Payment processing"}</div>
        <div className="big up">${(res.totalAmountCents / 100).toFixed(2)}</div>
        <div className="muted mono" style={{ fontSize: 12 }}>{res.brand} ••{res.last4}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {provider === "mock" ? (
        <div>
          <div className="field-label">Payment method · sandbox</div>
          <select className="select" value={pm} onChange={(e) => setPm(e.target.value)}>
            {MOCK_TOKENS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
      ) : (
        <div>
          <div className="field-label">Card</div>
          <div id="card-element" className="hosted-field">{provider.toUpperCase()} secure field · {env}</div>
        </div>
      )}
      {(err || res?.status === "FAILED") && <div className="down" style={{ fontSize: 12 }}>{err ?? res?.failureReason}</div>}
      <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Processing…" : "Pay now"}</button>
    </div>
  );
}

async function tokenizeWithProvider(): Promise<string> {
  // TODO: integrate provider JS SDK (Tilled.js / Finix.js) hosted fields and return the payment-method token.
  throw new Error("Hosted card fields not configured for this provider yet");
}
