import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { handler } from "@/lib/http";
import { closePeriod } from "@/lib/services/billing";

const Body = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

/** Manual / re-run of the monthly Elite close (idempotent). */
export const POST = handler(async (req: Request) => {
  await requireAdmin(req);
  const b = Body.parse(await req.json());
  return NextResponse.json(await closePeriod(b.period));
});
