import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/http";
import { PASSWORD_MIN, hashPassword } from "@/lib/password";
import { assignableRoles, can } from "@/lib/permissions";
import { getSessionUser } from "@/lib/session";

const Body = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  name: z.string().max(120).optional(),
  password: z.string().min(PASSWORD_MIN).max(256),
  role: z.enum(["PLATFORM_ADMIN", "OWNER", "DISPATCHER", "VIEWER"]),
  merchantId: z.string().optional(),
});

/** Create a console user. Admins: any merchant/role. Owners: own merchant, non-admin roles. */
export const POST = handler(async (req: Request) => {
  const me = await getSessionUser();
  if (!me) throw new HttpError(401, "Unauthorized");
  if (!can(me.role, "users:manage")) throw new HttpError(403, "Forbidden");

  const b = Body.parse(await req.json());
  if (!assignableRoles(me.role).includes(b.role)) throw new HttpError(403, `Cannot assign role ${b.role}`);

  const merchantId = b.role === "PLATFORM_ADMIN" ? null : me.role === "PLATFORM_ADMIN" ? b.merchantId ?? null : me.merchantId;
  if (b.role !== "PLATFORM_ADMIN" && !merchantId) throw new HttpError(400, "merchantId required");
  if (merchantId && !(await db.merchant.findUnique({ where: { id: merchantId } }))) throw new HttpError(404, "Merchant not found");
  if (await db.user.findUnique({ where: { email: b.email } })) throw new HttpError(409, "Email already in use");

  const u = await db.user.create({
    data: { email: b.email, name: b.name, role: b.role, merchantId, passwordHash: await hashPassword(b.password) },
  });
  return NextResponse.json({ id: u.id, email: u.email, role: u.role, merchantId: u.merchantId }, { status: 201 });
});

export const GET = handler(async () => {
  const me = await getSessionUser();
  if (!me) throw new HttpError(401, "Unauthorized");
  if (!can(me.role, "users:manage")) throw new HttpError(403, "Forbidden");
  const users = await db.user.findMany({
    where: me.role === "PLATFORM_ADMIN" ? {} : { merchantId: me.merchantId },
    select: { id: true, email: true, name: true, role: true, merchantId: true, lastLoginAt: true, disabledAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: users });
});
