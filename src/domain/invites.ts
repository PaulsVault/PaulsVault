// Dominio de invitaciones: registro cerrado. Solo un admin genera enlaces de invitación
// y sin invitación válida no se puede crear cuenta (evita distribución del contenido privado).
import { randomBytes, randomUUID } from "node:crypto";
import {
  createInvite, deleteInvite, getFirstUserId, getInviteByToken, getUserById,
  listInvites, type InviteRow,
} from "../store.js";
import { DomainError } from "./errors.js";

/** Admins configurados por env (coma-separado). Si no hay, el primer usuario registrado es admin. */
function adminEmails(): string[] {
  return (process.env["ADMIN_EMAILS"] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function isAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const emails = adminEmails();
  if (emails.length) {
    const u = await getUserById(userId);
    return !!u && emails.includes(u.email.toLowerCase());
  }
  return userId === (await getFirstUserId()); // bootstrap: dueño = primer usuario
}

export interface InviteView {
  id: string; token: string; label: string | null; url: string;
  used: boolean; usedAt: string | null; expiresAt: string | null; createdAt: string;
}

function toView(inv: InviteRow, baseUrl: string): InviteView {
  return {
    id: inv.id, token: inv.token, label: inv.label,
    url: `${baseUrl}/?invite=${inv.token}`,
    used: !!inv.used_by, usedAt: inv.used_at, expiresAt: inv.expires_at, createdAt: inv.created_at,
  };
}

export async function createInviteFor(adminId: string, label: string | undefined, expiresInDays: number | undefined, baseUrl: string): Promise<InviteView> {
  const row: InviteRow = {
    id: randomUUID(),
    token: randomBytes(18).toString("base64url"),
    created_by: adminId,
    label: label?.trim() || null,
    expires_at: expiresInDays && expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
    used_by: null, used_at: null,
    created_at: new Date().toISOString(),
  };
  await createInvite(row);
  return toView(row, baseUrl);
}

export async function listInviteViews(baseUrl: string): Promise<InviteView[]> {
  return (await listInvites()).map((i) => toView(i, baseUrl));
}

export async function revokeInvite(id: string): Promise<void> {
  if (!(await deleteInvite(id))) throw new DomainError("not_found", "Invitación no encontrada o ya usada.");
}

/** Valida que una invitación exista, no esté usada y no haya expirado (para el registro). */
export async function assertInviteUsable(token: string | undefined): Promise<void> {
  const inv = token ? await getInviteByToken(token) : undefined;
  if (!inv) throw new DomainError("validation", "Necesitas una invitación válida. Pídele un enlace al administrador.");
  if (inv.used_by) throw new DomainError("conflict", "Esa invitación ya fue usada.");
  if (inv.expires_at && Date.now() > Date.parse(inv.expires_at)) throw new DomainError("validation", "Esa invitación expiró.");
}
