import { db } from "./db";
import { sha256 } from "./crypto";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** Integration API auth: `Authorization: Bearer tp_test_...` → merchant. */
export async function requireMerchantKey(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!key) throw new HttpError(401, "Missing API key");
  const apiKey = await db.apiKey.findFirst({
    where: { hash: sha256(key), revokedAt: null },
    include: { merchant: true },
  });
  if (!apiKey) throw new HttpError(401, "Invalid API key");
  if (apiKey.merchant.status !== "ACTIVE") throw new HttpError(403, `Merchant not active (${apiKey.merchant.status})`);
  db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return apiKey.merchant;
}

/**
 * Platform admin auth for /api/admin/*: a PLATFORM_ADMIN console session,
 * or `Authorization: Bearer $ADMIN_API_KEY` for scripts/cron.
 */
export async function requireAdmin(req: Request) {
  const expected = process.env.ADMIN_API_KEY;
  const h = req.headers.get("authorization") ?? "";
  if (expected && expected !== "change-me" && expected.length >= 24 && h === `Bearer ${expected}`) return;
  const { getSessionUser } = await import("./session");
  const u = await getSessionUser();
  if (u?.role === "PLATFORM_ADMIN") return;
  throw new HttpError(401, "Unauthorized");
}
