// Dominio de recuperación de contraseña: enlaces de un solo uso emitidos por el admin.
// La app no envía correos (auth self-contained); el admin genera el enlace y se lo pasa al usuario
// (WhatsApp, etc.), o el dueño lo genera por CLI si se queda fuera. Lanza DomainError; no hace I/O de red.
import { randomBytes, randomUUID } from "node:crypto";
import {
  createPasswordReset, getPasswordReset, getUserByEmail, getUserById,
  markPasswordResetUsed, updateUserPassword,
} from "../store.js";
import { hashPassword } from "../auth.js";
import { DomainError } from "./errors.js";
import type { PublicUser } from "./auth.js";

const RESET_TTL_MS = 24 * 60 * 60 * 1000; // 24 h: margen para que el usuario abra el enlace que le pasa el admin.

export interface ResetLink { token: string; url: string; email: string; expiresAt: string; }

/** El admin (o el CLI del dueño) genera un enlace de recuperación para una cuenta existente. */
export async function createResetForEmail(email: string, baseUrl: string): Promise<ResetLink> {
  const mail = (email ?? "").trim().toLowerCase();
  const user = await getUserByEmail(mail);
  if (!user) throw new DomainError("not_found", "No hay ninguna cuenta con ese email.");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  await createPasswordReset({ token, user_id: user.id, expires_at: expiresAt, used_at: null, created_at: new Date().toISOString() });
  return { token, url: `${baseUrl}/?reset=${token}`, email: user.email, expiresAt };
}

/** Valida un token de recuperación y devuelve de qué cuenta es (para mostrarlo en el formulario). */
export async function getResetInfo(token: string): Promise<{ email: string }> {
  const user = await resolveValidReset(token);
  return { email: user.email };
}

/** Fija una nueva contraseña usando un token válido y devuelve el usuario (para iniciar sesión). */
export async function resetPassword(token: string, newPassword: string): Promise<PublicUser> {
  if (!newPassword || newPassword.length < 8) throw new DomainError("validation", "La contraseña debe tener al menos 8 caracteres.");
  const user = await resolveValidReset(token);
  await updateUserPassword(user.id, hashPassword(newPassword));
  await markPasswordResetUsed(token.trim());
  return { id: user.id, email: user.email };
}

/** Comprueba que el token exista, no esté usado y no haya expirado; devuelve el usuario dueño. */
async function resolveValidReset(token: string): Promise<{ id: string; email: string }> {
  const row = token ? await getPasswordReset(token.trim()) : undefined;
  if (!row) throw new DomainError("not_found", "Enlace de recuperación inválido.");
  if (row.used_at) throw new DomainError("validation", "Este enlace de recuperación ya se usó.");
  if (Date.parse(row.expires_at) < Date.now()) throw new DomainError("validation", "El enlace de recuperación caducó. Pide uno nuevo.");
  const user = await getUserById(row.user_id);
  if (!user) throw new DomainError("not_found", "La cuenta ya no existe.");
  return { id: user.id, email: user.email };
}
