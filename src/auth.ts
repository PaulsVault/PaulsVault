// Autenticación self-contained: hash de contraseña (scrypt) y tokens de sesión firmados (HMAC).
// Solo usa node:crypto — sin dependencias externas.

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

const SECRET = process.env["SESSION_SECRET"] ?? randomBytes(32).toString("hex");
if (!process.env["SESSION_SECRET"]) {
  // En prod hay que fijar SESSION_SECRET; si no, los tokens se invalidan al reiniciar.
  console.warn("[auth] SESSION_SECRET no definido: usando uno aleatorio (las sesiones no persisten entre reinicios).");
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

// ─── Contraseñas ───

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = Buffer.from(hashHex, "hex");
  const test = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return hash.length === test.length && timingSafeEqual(hash, test);
}

// ─── Tokens de sesión (mini-JWT HMAC) ───

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const sign = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64url");

export function signToken(userId: string): string {
  const payload = b64u(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub: string; exp: number };
    if (!sub || typeof exp !== "number" || Date.now() > exp) return null;
    return sub;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "dnd_session";
export const TOKEN_MAX_AGE_MS = TOKEN_TTL_MS;
