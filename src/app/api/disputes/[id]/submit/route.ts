import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { can } from "@/lib/permissions";
import { submitDispute } from "@/lib/services/disputes";
import { getSessionUser } from "@/lib/session";

/** Console: owner/admin submits the assembled evidence packet. */
export const POST = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "Unauthorized");
  if (!can(u.role, "disputes:manage")) throw new HttpError(403, "Forbidden");
  const d = await db.dispute.findUnique({ where: { id: ctx.params.id }, include: { payment: { select: { merchantId: true } } } });
  if (!d || (u.role !== "PLATFORM_ADMIN" && d.payment.merchantId !== u.merchantId)) throw new HttpError(404, "Dispute not found");
  const r = await submitDispute(d.id);
  return NextResponse.json({ id: r.id, status: r.status, submittedAt: r.submittedAt });
});
