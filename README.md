# BCI Synergy POS — Payments for the Trades

Standalone, white-label, multi-vertical payments SaaS (towing, auto repair, body shop, HVAC, plumbing, electrical, home services) running on PayFac-as-a-Service rails (Tilled / Finix). Integrates with any dispatch, FSM, or shop-management system through a REST API + signed webhooks.

> Brand is set by `BRAND_NAME` in `.env` (default: BCI Synergy POS).

## What's in Phase 1

| Module | File(s) | Status |
|---|---|---|
| Pricing engine: Standard / Surcharge / Cash Discount, debit block, state rules, 3% network cap, cost cap, 30-day notice | `src/lib/pricing.ts`, `src/lib/rules/states.ts` | ✅ tested |
| Elite dues credit (membership paid by processing) | `src/lib/dues.ts`, `src/lib/services/dues.ts` | ✅ tested |
| Provider adapters (swap without app changes) | `src/lib/providers/{mock,tilled,finix}.ts` | Mock ✅ · Tilled/Finix ⚠ verify in sandbox |
| Pay links (AI agent / auto-text / dispatch) | `POST /api/v1/pay-links` | ✅ |
| Hosted pay page (light theme) | `/pay/[token]` | ✅ mock · hosted fields TODO |
| Inbound provider webhooks (idempotent) | `/api/webhooks/[provider]` | ✅ |
| Outbound signed webhooks to integrators | `POST /api/v1/webhook-endpoints` | ✅ |
| Operator console (terminal theme) | `/dashboard` | ✅ |
| Merchant boarding + API keys | `POST /api/admin/merchants` | ✅ |
| Console login: email/password (scrypt), DB sessions, roles, merchant scoping, rate-limited | `/login`, `src/lib/session.ts`, `src/lib/permissions.ts` | ✅ |
| User management (admin → any merchant; owner → own merchant) | `POST/GET /api/users` | ✅ |
| Elite monthly billing: ledger finalize, dues invoice, pay link on house account, auto-mark paid | `src/lib/services/billing.ts`, `/dashboard/billing` | ✅ |
| Monthly close cron (1st, 11:00 UTC) | `vercel.json` → `/api/cron/close-period` | ✅ |
| Chargeback evidence locker: photos, signature, GPS, timeline, call ref, docs per job; card-number guard | `POST/GET /api/v1/jobs/evidence` | ✅ |
| Dispute auto-assembly: reason → category, strength score 0–100, missing list, packet; optional auto-submit ≥70 | `src/lib/evidence.ts`, `src/lib/services/disputes.ts` | ✅ |
| Disputes console: deadlines, $ at risk, win rate, packet view, one-click submit | `/dashboard/disputes` | ✅ |

Design previews: `design/console.png`, `design/pay.png` (open the `.html` files to view).

## Run locally

```bash
cp .env.example .env            # set DATABASE_URL, ADMIN_API_KEY
npm install
npx prisma migrate dev --name init
npm run db:seed                 # prints merchant #1 API key, logins + PLATFORM_MERCHANT_ID → put that id in .env
npm run dev                     # http://localhost:3000/login
npm test                        # 50 unit tests
```

## Integration API (for your dispatch SaaS and partners)

Auth: `Authorization: Bearer bci_test_...` (per-merchant key, hashed at rest).

### Create a pay link — the core call
```http
POST /api/v1/pay-links
{
  "amountCents": 24500,
  "description": "Tow · I-95 MM 42 → Shop",
  "customer": { "name": "J. Rivera", "phone": "+15550100123" },
  "job": { "source": "dispatch", "externalRef": "T-10441", "details": { "truck": "12", "from": "I-95 MM 42" } }
}
→ 201
{
  "id": "...", "url": "https://pay.yourbrand.com/pay/<token>",
  "pricing": { "cashPriceCents": 24500, "creditPriceCents": 25358, "debitPriceCents": 25358 }
}
```
AI phone agent flow: book job → call this → text `url` to caller → read back `pricing` → webhook marks job paid.

### Other endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/quote` | Price preview `{ amountCents, funding }` |
| GET | `/api/v1/payments?jobExternalRef=T-10441` | Payments for a job |
| GET | `/api/v1/dues` | Elite coverage meter (credit, balance, % covered) |
| POST | `/api/v1/webhook-endpoints` | Register `https://` URL + events; secret returned once |

### Push scene evidence (driver app / dispatch)
```http
POST /api/v1/jobs/evidence
{
  "job": { "source": "dispatch", "externalRef": "T-10441" },
  "items": [
    { "type": "TIMELINE_EVENT", "data": { "event": "arrived" }, "capturedAt": "2026-11-12T15:02:00Z", "capturedBy": "truck 12" },
    { "type": "GPS", "data": { "lat": 25.7617, "lng": -80.1918, "accuracyM": 8, "label": "arrival" }, "capturedAt": "2026-11-12T15:02:05Z" },
    { "type": "PHOTO", "url": "https://files.yourapp.com/t-10441/hookup.jpg", "capturedAt": "2026-11-12T15:10:00Z" },
    { "type": "SIGNATURE", "url": "https://files.yourapp.com/t-10441/sig.png", "capturedAt": "2026-11-12T15:40:00Z" }
  ]
}
```
Types: `PHOTO`, `SIGNATURE`, `GPS`, `TIMELINE_EVENT`, `CALL_RECORDING`, `DOCUMENT`, `CUSTOMER_AUTHORIZATION`, `NOTE`. Files must be `https` URLs. Anything resembling a card number is rejected (422). Evidence added later refreshes any open dispute automatically.

**Strength weights by dispute type:** fraud → signature, authorization, call recording, GPS; service not provided → GPS, timeline, photos; not as described → photos, signed estimate. Merchant setting `settings.autoSubmitDisputes = true` submits automatically when strength ≥ 70.

### Outbound webhooks
Events: `payment.succeeded`, `payment.failed`, `payment.refunded`, `dispute.created` (includes category + strength), `dispute.submitted`.
Header: `BCI-Signature: t=<unix>,v1=<hex hmac_sha256(secret, t + "." + body)>` — verify with `verifyWebhookSignature()` in `src/lib/crypto.ts`.

## Roles

| Role | Console | Pay links | Elite billing | Users | Board merchants / close period |
|---|---|---|---|---|---|
| PLATFORM_ADMIN | all merchants | ✅ | all members | any | ✅ |
| OWNER | own shop | ✅ | own invoices | own shop (no admins) | — |
| DISPATCHER | own shop | ✅ | — | — | — |
| VIEWER | own shop (read) | — | — | — | — |

## Elite billing flow

1. Every succeeded payment updates the member's month ledger (platform revenue credited to $500 dues).
2. On the 1st, the close finalizes last month: fully covered → `FREE` ($0 record); balance → `OPEN` invoice + pay link on the house account, sent to the owner.
3. When that pay link is paid, the invoice flips to `PAID` automatically. Re-running a close is a no-op.

## Compliance guardrails (built in)

- **Card data never touches our servers** — hosted fields tokenize in-browser; API accepts tokens only (PCI SAQ-A scope).
- **AI voice agents must never capture card numbers** — use pay links or Twilio `<Pay>`; pause recordings during payment.
- **Surcharge**: credit only, never debit/prepaid/unknown; blocked in CT/MA/CA/ME; capped at min(requested, merchant cost, 3%, state cap); requires 30-day notice on file.
- **Cash discount**: card price posted, cash/ACH gets discount; works in all states.
- `src/lib/rules/states.ts` is compliance data — **have payments counsel verify before go-live**.

## Go-live checklist

1. Sign PFaaS partner agreement (Tilled/Finix) — negotiate margin, merchant portability, chargeback liability.
2. Verify adapter endpoints + webhook signatures in provider sandbox; wire hosted fields in `PayForm.tsx`.
3. Set `CRON_SECRET`, `PLATFORM_MERCHANT_ID`; add 2FA and back the login rate-limiter with Redis for multi-instance.
4. Move outbound webhooks to a durable queue with retries.
5. Counsel review: state rules, cash-discount signage, Elite dues-credit structure, UBIT/entity.
6. Board merchant #1 (your shop) → live transactions → 10-shop pilot.

## Phase 2 backlog

Driver app (Expo) w/ Tap to Pay + scene evidence capture (feeds the locker) · instant payouts · ACH · consumer financing (HVAC) · vertical modules (impound/storage, repair orders, insurance split) · dues true-up billing · partner/reseller portal.
