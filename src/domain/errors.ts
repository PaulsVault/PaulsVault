// Contrato de errores de la capa de dominio.
// Las funciones de dominio lanzan DomainError; el adaptador HTTP lo mapea a un código.

export type DomainCode = "not_found" | "conflict" | "validation" | "rule";

export class DomainError extends Error {
  constructor(readonly code: DomainCode, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** Mapa código de dominio → estado HTTP (lo usa el middleware de la API). */
export const STATUS_BY_CODE: Record<DomainCode, number> = {
  not_found: 404,
  conflict: 409,
  validation: 400,
  rule: 422,
};

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
