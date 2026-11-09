/** Pure description of the one-tap demo scenario. Unit-tested; no side effects here. */
import type { Role } from '../session/SessionContext';

export const DEMO_ORDER_TITLE_PREFIX = '300 chompas de alpaca';
export const isDemoOrder = (order: { title: string }): boolean => order.title.startsWith(DEMO_ORDER_TITLE_PREFIX);

const ROLES: readonly Role[] = ['comprador', 'proveedor', 'inversionista', 'coordinadora'];

/** `?rol=` picks who the presenter starts as. The buyer has the first real action (deposit). */
export function parseDemoRole(search: string): Role {
  const value = new URLSearchParams(search).get('rol')?.toLowerCase();
  return ROLES.find((r) => r === value) ?? 'comprador';
}

export type StepId = 'wallets' | 'accounts' | 'funds' | 'order';

export const DEMO_STEPS: ReadonlyArray<{ id: StepId; label: string; hint: string }> = [
  { id: 'wallets', label: 'Creando cuentas', hint: 'Una cuenta para cada participante.' },
  { id: 'accounts', label: 'Preparando cuentas', hint: 'Cada cuenta queda lista para recibir pagos.' },
  { id: 'funds', label: 'Cargando saldo de prueba', hint: 'Dinero de demostración, sin valor real.' },
  { id: 'order', label: 'Armando el pedido', hint: 'Cotización aceptada y cobro protegido activado.' },
];

export type PlannedWallet = {
  slot: string;
  label: string;
  role: Role;
  /** For workshops: the local supplier id the slot is keyed by. */
  workshopId?: string;
  /** Holds demo money to deposit (buyer) or to buy an advance (investor). */
  needsFunds: boolean;
};

export type DemoWallet = PlannedWallet & { address: string };

export function walletPlan(workshops: Array<{ id: string; name: string }>): PlannedWallet[] {
  return [
    { slot: 'coordinadora', label: 'Coordinadora', role: 'coordinadora', needsFunds: false },
    { slot: 'comprador', label: 'Comprador', role: 'comprador', needsFunds: true },
    ...workshops.map((w) => ({
      slot: `proveedor:${w.id}`,
      label: w.name,
      role: 'proveedor' as const,
      workshopId: w.id,
      needsFunds: false,
    })),
    { slot: 'inversionista', label: 'Inversionista', role: 'inversionista', needsFunds: true },
  ];
}

/** The order is about 8,000 digital dollars; below this the buyer could not deposit it. */
export const FUNDS_MIN = 9_000;
export const needsFaucet = (pusd: number | null): boolean => pusd === null || pusd < FUNDS_MIN;

export const landingPath = (orderId: string): string => `/orders/${orderId}?seccion=payment`;
