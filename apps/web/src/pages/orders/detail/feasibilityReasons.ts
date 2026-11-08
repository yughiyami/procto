/**
 * The server's feasibility reasons (see apps/api/src/domain.ts `feasibility()`) are terse
 * English tokens meant for logs, not readers. This module maps the known shapes to plain
 * Spanish and safely falls back to the raw string for anything unrecognized, so a future
 * server-side reason never renders as a blank line.
 */

export type ReasonKind = 'unconfirmed' | 'mismatch' | 'late' | 'expired' | 'allocation' | 'other';

export function reasonKind(reason: string): ReasonKind {
  if (reason.startsWith('Unconfirmed:')) return 'unconfirmed';
  if (reason.startsWith('Specification mismatch:')) return 'mismatch';
  if (reason.startsWith('Late:')) return 'late';
  if (reason.startsWith('Expired:')) return 'expired';
  if (reason.startsWith('Allocated')) return 'allocation';
  return 'other';
}

/** Extracts the supplier id embedded in a per-supplier reason, or null for allocation/unknown reasons. */
export function reasonSupplierId(reason: string): string | null {
  const match = /^(?:Unconfirmed|Specification mismatch|Late|Expired): (.+)$/.exec(reason);
  if (!match) return null;
  return match[1] ?? null;
}

export function translateFeasibilityReason(reason: string, resolveSupplierName: (id: string) => string): string {
  const unconfirmed = /^Unconfirmed: (.+)$/.exec(reason);
  if (unconfirmed) {
    return `Aporte sin confirmar de ${resolveSupplierName(unconfirmed[1] ?? '')}`;
  }

  const mismatch = /^Specification mismatch: (.+)$/.exec(reason);
  if (mismatch) {
    return `La especificación del aporte de ${resolveSupplierName(mismatch[1] ?? '')} no coincide con la solicitada`;
  }

  const late = /^Late: (.+)$/.exec(reason);
  if (late) {
    return `${resolveSupplierName(late[1] ?? '')} entrega después de la fecha requerida`;
  }

  const expired = /^Expired: (.+)$/.exec(reason);
  if (expired) {
    return `El compromiso de ${resolveSupplierName(expired[1] ?? '')} ya venció`;
  }

  const allocated = /^Allocated (\d+), required (\d+)$/.exec(reason);
  if (allocated) {
    const have = Number(allocated[1] ?? '0');
    const need = Number(allocated[2] ?? '0');
    return `Asignadas ${have} de ${need} unidades — faltan ${Math.max(need - have, 0)}`;
  }

  return reason;
}
