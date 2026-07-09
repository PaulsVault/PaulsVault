// Dominio de autenticación: registro y login. Lanza DomainError; no hace I/O de red.
import { randomUUID } from "node:crypto";
import { createUser, getUserByEmail } from "../store.js";
import { hashPassword, verifyPassword } from "../auth.js";
import { DomainError } from "./errors.js";

export interface PublicUser { id: string; email: string; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerUser(email: string, password: string): PublicUser {
  const mail = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new DomainError("validation", "Email inválido.");
  if (!password || password.length < 8) throw new DomainError("validation", "La contraseña debe tener al menos 8 caracteres.");
  if (getUserByEmail(mail)) throw new DomainError("conflict", "Ya existe una cuenta con ese email.");
  const id = randomUUID();
  createUser(id, mail, hashPassword(password));
  return { id, email: mail };
}

export function loginUser(email: string, password: string): PublicUser {
  const mail = (email ?? "").trim().toLowerCase();
  const user = getUserByEmail(mail);
  // Mismo error para email inexistente y contraseña mala (no filtrar qué falló).
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new DomainError("validation", "Email o contraseña incorrectos.");
  }
  return { id: user.id, email: user.email };
}
