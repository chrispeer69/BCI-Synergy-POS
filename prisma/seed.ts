/**
 * Demo data: merchant #1 (towing, Elite, cash discount) + payments for the console.
 * Prints the integration API key once.
 */
import { PrismaClient } from "@prisma/client";
import { generateApiKey, randomToken } from "../src/lib/crypto";
import { priceCharge } from "../src/lib/pricing";
import { platformRevenue, estimateProviderCost } from "../src/lib/economics";
import { computeDuesCredit, periodOf } from "../src/lib/dues";
import { hashPassword } from "../src/lib/password";

const db = new PrismaClient();

async function main() {
  const key = generateApiKey("test");
  const m = await db.merchant.create({
    data: {
      legalName: "Merchant One Towing LLC",
      dbaName: "Merchant One Towing",
      vertical: "TOWING",
      state: "FL",
      email: "ops@example.com",
      phone: "(555) 010-0100",
      pricingMode: "CASH_DISCOUNT",
      cashDiscountBps: 350,
      membershipTier: "ELITE",
      provider: "mock",
      providerAccountId: `acct_mock_${randomToken(8)}`,
      status: "ACTIVE",
      apiKeys: { create: { name: "dispatch-integration", prefix: key.prefix, hash: key.hash } },
    },
  });

  const fundings = ["CREDIT", "CREDIT", "DEBIT", "CREDIT", "ACH", "CREDIT", "DEBIT"] as const;
  let revenue = 0;
  for (let i = 0; i < 40; i++) {
    const base = 9_500 + Math.round(Math.random() * 30_000);
    const funding = fundings[i % fundings.length];
    const q = priceCharge({ mode: "CASH_DISCOUNT", baseAmountCents: base, funding, state: "FL", surchargeBps: 300, creditCostBps: 300, cashDiscountBps: 350 });
    const rev = platformRevenue(q.totalCents, 75);
    revenue += rev;
    const job = await db.job.create({ data: { merchantId: m.id, source: "dispatch", externalRef: `T-${10400 + i}`, title: "Light-duty tow" } });
    await db.payment.create({
      data: {
        merchantId: m.id, jobId: job.id, channel: i % 3 ? "PAY_LINK" : "TAP_TO_PAY", funding, status: "SUCCEEDED",
        baseAmountCents: base, feeAmountCents: q.feeCents, totalAmountCents: q.totalCents, feeLabel: q.feeLabel,
        providerCostCents: estimateProviderCost(q.totalCents, funding, i % 3 === 0), platformRevenueCents: rev,
        brand: funding === "ACH" ? "ACH" : "VISA", last4: String(1000 + i).slice(-4),
        createdAt: new Date(Date.now() - i * 3_600_000 * 6),
      },
    });
  }
  const period = periodOf(new Date());
  const r = computeDuesCredit(50_000, revenue);
  await db.duesLedgerEntry.create({ data: { merchantId: m.id, period, duesCents: r.duesCents, creditCents: r.creditCents, balanceDueCents: r.balanceDueCents, excessCents: r.excessCents } });

  await db.payLink.create({
    data: { merchantId: m.id, token: randomToken(18), description: "Tow · I-95 MM 42 → Shop", baseAmountCents: 24_500, customerName: "J. Rivera", expiresAt: new Date(Date.now() + 72 * 3_600_000) },
  });

  // House account: collects Elite dues balances (set PLATFORM_MERCHANT_ID to this id)
  const house = await db.merchant.create({
    data: {
      legalName: "BCI Synergy LLC", dbaName: "BCI Synergy", vertical: "OTHER", state: "FL", email: "billing@example.com",
      pricingMode: "STANDARD", provider: "mock", providerAccountId: `acct_mock_${randomToken(8)}`, status: "ACTIVE",
    },
  });

  // Console users — passwords printed once
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? randomToken(12);
  const ownerPw = randomToken(12);
  await db.user.create({ data: { email: (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase(), name: "Platform Admin", role: "PLATFORM_ADMIN", passwordHash: await hashPassword(adminPw) } });
  await db.user.create({ data: { email: "owner@merchantone.example", name: "Merchant One Owner", role: "OWNER", merchantId: m.id, passwordHash: await hashPassword(ownerPw) } });

  console.log(`Merchant #1:          ${m.id}
API key (shown once): ${key.key}
PLATFORM_MERCHANT_ID: ${house.id}
Admin login:          ${(process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase()} / ${adminPw}
Owner login:          owner@merchantone.example / ${ownerPw}`);
}

main().finally(() => db.$disconnect());
