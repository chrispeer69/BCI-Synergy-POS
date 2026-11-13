import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { usd } from "@/lib/format";
import { getProvider } from "@/lib/providers";
import { quoteFor } from "@/lib/services/payments";
import { PayForm } from "./PayForm";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: { token: string } }) {
  const link = await db.payLink.findUnique({ where: { token: params.token }, include: { merchant: true } });
  if (!link) notFound();
  const m = link.merchant;
  const credit = quoteFor(m, link.baseAmountCents, "CREDIT");
  const debit = quoteFor(m, link.baseAmountCents, "DEBIT");
  const expired = link.expiresAt < new Date();
  const hf = m.providerAccountId ? getProvider(m.provider).hostedFieldsConfig(m.providerAccountId) : null;

  return (
    <main className="paper">
      <div className="pay-wrap">
        <div className="pay-card">
          <div className="pay-head">
            <div className="merchant">{m.dbaName}</div>
            <div className="desc">{link.description}</div>
          </div>

          {link.status === "PAID" ? (
            <div className="result">
              <div className="field-label">Status</div>
              <div className="big up">PAID</div>
              <div className="muted">This invoice has been paid. Thank you.</div>
            </div>
          ) : expired || link.status !== "OPEN" ? (
            <div className="result">
              <div className="big down">{expired ? "EXPIRED" : link.status}</div>
              <div className="muted">Contact {m.dbaName}{m.phone ? ` at ${m.phone}` : ""} for a new link.</div>
            </div>
          ) : (
            <div className="pay-body">
              <div>
                {m.pricingMode === "CASH_DISCOUNT" ? (
                  <>
                    <div className="price-row"><span className="k">Cash / bank price</span><span className="v">{usd(link.baseAmountCents)}</span></div>
                    <div className="price-row total"><span className="k">Card price</span><span className="v">{usd(credit.totalCents)}</span></div>
                  </>
                ) : m.pricingMode === "SURCHARGE" && credit.feeCents > 0 ? (
                  <>
                    <div className="price-row"><span className="k">Amount</span><span className="v">{usd(link.baseAmountCents)}</span></div>
                    <div className="price-row"><span className="k">{credit.feeLabel} · credit only</span><span className="v">{usd(credit.feeCents)}</span></div>
                    <div className="price-row total"><span className="k">Total · credit</span><span className="v">{usd(credit.totalCents)}</span></div>
                    <div className="price-row"><span className="k">Total · debit (no surcharge)</span><span className="v">{usd(debit.totalCents)}</span></div>
                  </>
                ) : (
                  <div className="price-row total"><span className="k">Amount due</span><span className="v">{usd(link.baseAmountCents)}</span></div>
                )}
              </div>

              <PayForm token={link.token} provider={hf?.provider ?? "none"} env={hf?.env ?? "sandbox"} />

              <div className="disclosure">
                {m.pricingMode === "CASH_DISCOUNT" &&
                  "Prices shown are card prices. A discount is available when paying by cash or bank transfer (ACH)."}
                {m.pricingMode === "SURCHARGE" &&
                  "A surcharge applies to credit cards only and does not exceed our cost of acceptance. No surcharge on debit cards."}{" "}
                Card details are entered directly with our PCI-compliant payment processor and never stored by {m.dbaName}.
              </div>
            </div>
          )}

          <div className="pay-foot">
            <span>Secure payment</span>
            <span>{process.env.BRAND_NAME ?? "TradePay"}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
