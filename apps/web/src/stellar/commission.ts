/**
 * PROCTO business model, enforced by the payment split itself (no contract change):
 * a commission on the closed sale (3%, or 2% for PRO coordinators) is paid automatically to the
 * PROCTO treasury, and 8% of that commission goes to the impact fund as its own share.
 * Pure and unit-tested.
 */

export const STANDARD_RATE_BPS = 300;
export const PRO_RATE_BPS = 200;
/** Share of the commission that goes to reforestation and Andean communities (PRISMA). */
export const IMPACT_SHARE_BPS = 800;

export const commissionRateBps = (pro: boolean): number => (pro ? PRO_RATE_BPS : STANDARD_RATE_BPS);

export type CommissionSplit = {
  rateBps: number;
  commissionCents: number;
  impactCents: number;
  treasuryCents: number;
};

export function splitCommission(priceCents: number, pro: boolean): CommissionSplit {
  const rateBps = commissionRateBps(pro);
  const commissionCents = Math.floor((priceCents * rateBps) / 10_000);
  const impactCents = Math.floor((commissionCents * IMPACT_SHARE_BPS) / 10_000);
  return { rateBps, commissionCents, impactCents, treasuryCents: commissionCents - impactCents };
}

export function describeCommission(pro: boolean): string {
  const rate = commissionRateBps(pro) / 100;
  return `PROCTO cobra ${rate}% de la venta cerrada${pro ? ' (tarifa PRO)' : ''}, solo cuando el pedido se cobra. El 8% de esa comisión va a reforestación y comunidades andinas.`;
}

export const COMMISSION_LABEL = 'Comisión PROCTO';
export const IMPACT_LABEL = 'Fondo de impacto (reforestación)';
