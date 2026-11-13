import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN = 12;

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < PASSWORD_MIN) throw new Error(`Password must be at least ${PASSWORD_MIN} characters`);
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Constant-ish work for unknown users so login timing doesn't reveal which emails exist. */
let dummy: string | null = null;
export async function burnPasswordCheck(password: string) {
  dummy ??= await hashPassword("x".repeat(PASSWORD_MIN));
  await verifyPassword(password, dummy);
}
