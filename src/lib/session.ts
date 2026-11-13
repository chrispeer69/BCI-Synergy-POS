import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { can, type Action } from "./permissions";

export const SESSION_COOKIE = "bci_session";
const TTL_MS = 7 * 24 * 3_600_000;

export async function createSession(userId: string) {
  const token = randomToken(32);
  const h = headers();
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + TTL_MS),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: { include: { merchant: true } } } });
  if (!s || s.expiresAt < new Date() || s.user.disabledAt) return null;
  return s.user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

/** For server components/pages: redirect to /login when unauthenticated or forbidden. */
export async function requireUser(action?: Action): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (action && !can(u.role, action)) redirect("/dashboard");
  return u;
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  cookies().delete(SESSION_COOKIE);
}
