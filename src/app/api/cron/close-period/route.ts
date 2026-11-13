import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";
import { safeEqualHex, sha256 } from "@/lib/crypto";
import { isPeriod, previousPeriod } from "@/lib/dues";
import { handler } from "@/lib/http";
import { closePeriod } from "@/lib/services/billing";

/**
 * Monthly Elite close. Scheduled by vercel.json (1st of month) → GET with
 * `Authorization: Bearer $CRON_SECRET`. Optional ?period=YYYY-MM for a manual re-run.
 */
export const GET = handler(async (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (secret.length < 24 || !safeEqualHex(sha256(got), sha256(secret))) throw new HttpError(401, "Unauthorized");

  const q = new URL(req.url).searchParams.get("period");
  const period = q ?? previousPeriod(new Date());
  if (!isPeriod(period)) throw new HttpError(400, "period must be YYYY-MM");
  return NextResponse.json(await closePeriod(period));
});
