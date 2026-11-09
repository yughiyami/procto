import type { IconName } from '@izumi/ui';
import type { Role } from '../session/SessionContext';

export type NavGroupId = 'operacion' | 'red' | 'finanzas' | 'ayuda';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  group: NavGroupId;
  /** Compact label for the mobile bottom bar. */
  shortLabel?: string;
  roles: Role[];
  /** Shown directly in the mobile bottom bar; everything else lives under "Más". */
  primary?: boolean;
  /** Anchor for the guided tour. */
  tour?: string;
};

export const NAV_GROUPS: ReadonlyArray<{ id: NavGroupId; label: string }> = [
  { id: 'operacion', label: 'Operación' },
  { id: 'red', label: 'Red' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'ayuda', label: 'Ayuda' },
];

const ALL: Role[] = ['coordinadora', 'comprador', 'proveedor', 'inversionista'];
const COORD: Role[] = ['coordinadora'];

/** Single source for the sidebar, the mobile bar and the "Más" sheet. Items are filtered by the active role. */
export const navItems: NavItem[] = [
  { to: '/inicio', label: 'Inicio', icon: 'spark', group: 'operacion', roles: ALL, primary: true },
  { to: '/orders', label: 'Pedidos', icon: 'orders', group: 'operacion', roles: ['coordinadora', 'comprador'], primary: true },
  { to: '/proveedor', label: 'Mis cobros', icon: 'finance', group: 'operacion', roles: ['proveedor'], primary: true },
  { to: '/ventas', label: 'Ventas', icon: 'package', group: 'operacion', roles: COORD },
  { to: '/bandeja', label: 'Bandeja', icon: 'inbox', group: 'operacion', roles: COORD },

  { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', group: 'red', shortLabel: 'Talleres', roles: COORD },
  { to: '/directory', label: 'Directorio y RFQ', icon: 'external-link', group: 'red', shortLabel: 'Directorio', roles: COORD },
  { to: '/chat', label: 'Conversaciones', icon: 'chat', group: 'red', shortLabel: 'Chats', roles: COORD },
  { to: '/agentes', label: 'Propuestas', icon: 'agents', group: 'red', roles: COORD },

  { to: '/adelantos', label: 'Adelantos', icon: 'finance', group: 'finanzas', roles: ['inversionista', 'proveedor'], primary: true },
  { to: '/finanzas', label: 'Caja', icon: 'finance', group: 'finanzas', roles: COORD },
  { to: '/cuenta', label: 'Mi billetera', icon: 'lock', group: 'finanzas', shortLabel: 'Billetera', roles: ALL, primary: true },
  { to: '/negocio', label: 'Mi negocio y PRO', icon: 'user', group: 'finanzas', shortLabel: 'Negocio', roles: ALL },

  { to: '/paco', label: 'PACO', icon: 'spark', group: 'ayuda', roles: ALL, primary: true, tour: 'nav-paco' },
  { to: '/voz', label: 'PACO por voz', icon: 'chat', group: 'ayuda', roles: COORD },
  { to: '/integraciones', label: 'Integraciones', icon: 'integrations', group: 'ayuda', shortLabel: 'Config', roles: COORD },
  { to: '/como-funciona', label: 'Cómo funciona', icon: 'info', group: 'ayuda', shortLabel: 'Guía', roles: ALL },
];

export function navFor(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

/** Items of a role arranged by group, skipping empty groups. */
export function groupedNavFor(role: Role): Array<{ id: NavGroupId; label: string; items: NavItem[] }> {
  const items = navFor(role);
  return NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter((g) => g.items.length > 0);
}

/** Destinations pinned to the phone's bottom bar (max 4; "Más" is the fifth slot when anything else exists). */
export function barItemsFor(role: Role): { bar: NavItem[]; more: NavItem[] } {
  const items = navFor(role);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  return { bar: primary, more: items.filter((i) => !primary.includes(i)) };
}
