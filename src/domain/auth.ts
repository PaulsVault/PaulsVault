// Dominio de autenticación: registro y login. Lanza DomainError; no hace I/O de red.
import { randomUUID } from "node:crypto";
import { countUsers, createUser, getUserByEmail, markInviteUsed } from "../store.js";
import { hashPassword, verifyPassword } from "../auth.js";
import { assertInviteUsable } from "./invites.js";
import { DomainError } from "./errors.js";

export interface PublicUser { id: string; email: string; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerUser(email: string, password: string, invite?: string): Promise<PublicUser> {
  const mail = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new DomainError("validation", "Email inválido.");
  if (!password || password.length < 8) throw new DomainError("validation", "La contraseña debe tener al menos 8 caracteres.");
  if (await getUserByEmail(mail)) throw new DomainError("conflict", "Ya existe una cuenta con ese email.");

  // Registro cerrado por invitación, salvo el primer usuario (bootstrap del dueño).
  const bootstrap = (await countUsers()) === 0;
  const token = invite?.trim() || undefined;
  if (!bootstrap) await assertInviteUsable(token);

  const id = randomUUID();
  await createUser(id, mail, hashPassword(password));
  if (!bootstrap && token) await markInviteUsed(token, id);
  return { id, email: mail };
}

export async function loginUser(email: string, password: string): Promise<PublicUser> {
  const mail = (email ?? "").trim().toLowerCase();
  const user = await getUserByEmail(mail);
  // Mismo error para email inexistente y contraseña mala (no filtrar qué falló).
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new DomainError("validation", "Email o contraseña incorrectos.");
  }
  return { id: user.id, email: user.email };
}
