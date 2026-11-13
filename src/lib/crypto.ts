import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Returns full key (show once) + prefix + hash (store). */
export function generateApiKey(env: "live" | "test" = "test") {
  const secret = randomToken(32);
  const prefix = `tp_${env}_${secret.slice(0, 8)}`;
  const key = `${prefix}_${secret.slice(8)}`;
  return { key, prefix, hash: sha256(key) };
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Outbound webhook signature header: t=<unix>,v1=<hmac(t.body)> */
export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${hmacSha256(secret, `${t}.${body}`)}`;
}

export function verifyWebhookSignature(secret: string, body: string, header: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  return safeEqualHex(hmacSha256(secret, `${t}.${body}`), parts.v1);
}
