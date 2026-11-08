import type { IconName } from '@izumi/ui';
import type { Role } from '../session/SessionContext';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  /** Compact label for the mobile bottom bar. */
  shortLabel?: string;
  roles: Role[];
};

const ALL: Role[] = ['coordinadora', 'comprador', 'proveedor', 'inversionista'];

/** Single source for the sidebar and the mobile bottom bar. Items are filtered by the active role. */
export const navItems: NavItem[] = [
  { to: '/inicio', label: 'Inicio', icon: 'spark', roles: ALL },
  { to: '/orders', label: 'Pedidos', icon: 'orders', roles: ['coordinadora', 'comprador'] },
  { to: '/proveedor', label: 'Mis cobros', icon: 'finance', roles: ['proveedor'] },
  { to: '/adelantos', label: 'Adelantos', icon: 'finance', roles: ['inversionista', 'proveedor'] },
  { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', shortLabel: 'Talleres', roles: ['coordinadora'] },
  { to: '/finanzas', label: 'Caja', icon: 'finance', roles: ['coordinadora'] },
  { to: '/cuenta', label: 'Mi billetera', icon: 'user', shortLabel: 'Billetera', roles: ALL },
  { to: '/como-funciona', label: 'Cómo funciona', icon: 'info', shortLabel: 'Guía', roles: ALL },
];

export function navFor(role: Role): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}
