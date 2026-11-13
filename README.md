# TradePay — Payments for the Trades

Standalone, white-label, multi-vertical payments SaaS (towing, auto repair, body shop, HVAC, plumbing, electrical, home services) running on PayFac-as-a-Service rails (Tilled / Finix). Integrates with any dispatch, FSM, or shop-management system through a REST API + signed webhooks.

> `TradePay` is a placeholder brand — set `BRAND_NAME` in `.env`.

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

Design previews: `design/console.png`, `design/pay.png` (open the `.html` files to view).

## Run locally

```bash
cp .env.example .env            # set DATABASE_URL, ADMIN_API_KEY
npm install
npx prisma migrate dev --name init
npm run db:seed                 # prints merchant #1 API key
npm run dev                     # http://localhost:3000/dashboard (user: any, pass: ADMIN_API_KEY)
npm test                        # 22 unit tests
```

## Integration API (for your dispatch SaaS and partners)

Auth: `Authorization: Bearer tp_test_...` (per-merchant key, hashed at rest).

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

### Outbound webhooks
Events: `payment.succeeded`, `payment.failed`, `payment.refunded`, `dispute.created`.
Header: `TradePay-Signature: t=<unix>,v1=<hex hmac_sha256(secret, t + "." + body)>` — verify with `verifyWebhookSignature()` in `src/lib/crypto.ts`.

## Compliance guardrails (built in)

- **Card data never touches our servers** — hosted fields tokenize in-browser; API accepts tokens only (PCI SAQ-A scope).
- **AI voice agents must never capture card numbers** — use pay links or Twilio `<Pay>`; pause recordings during payment.
- **Surcharge**: credit only, never debit/prepaid/unknown; blocked in CT/MA/CA/ME; capped at min(requested, merchant cost, 3%, state cap); requires 30-day notice on file.
- **Cash discount**: card price posted, cash/ACH gets discount; works in all states.
- `src/lib/rules/states.ts` is compliance data — **have payments counsel verify before go-live**.

## Go-live checklist

1. Sign PFaaS partner agreement (Tilled/Finix) — negotiate margin, merchant portability, chargeback liability.
2. Verify adapter endpoints + webhook signatures in provider sandbox; wire hosted fields in `PayForm.tsx`.
3. Replace console Basic auth (`src/middleware.ts`) with real auth + roles.
4. Move outbound webhooks to a durable queue with retries.
5. Counsel review: state rules, cash-discount signage, Elite dues-credit structure, UBIT/entity.
6. Board merchant #1 (your shop) → live transactions → 10-shop pilot.

## Phase 2 backlog

Driver app (Expo) w/ Tap to Pay + scene evidence · dispute evidence auto-submit · instant payouts · ACH · consumer financing (HVAC) · vertical modules (impound/storage, repair orders, insurance split) · dues true-up billing · partner/reseller portal.
