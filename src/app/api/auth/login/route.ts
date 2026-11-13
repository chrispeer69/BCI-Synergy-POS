import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/ratelimit";
import { createSession } from "@/lib/session";

const Body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });

export const POST = handler(async (req: Request) => {
  const b = Body.parse(await req.json());
  const email = b.email.toLowerCase().trim();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  for (const key of [`ip:${ip}`, `email:${email}`]) {
    const r = rateLimit(`login:${key}`, 10, 15 * 60_000);
    if (!r.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "retry-after": String(r.retryAfterSec) } });
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.disabledAt) {
    await burnPasswordCheck(b.password);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (!(await verifyPassword(b.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
});
