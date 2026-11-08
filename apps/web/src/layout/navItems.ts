import type { IconName } from '@izumi/ui';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  /** Optional compact label for the four mobile destinations. */
  shortLabel?: string;
};

/** Single source of truth for both the desktop sidebar and the mobile bottom tab bar. */
export const navItems: NavItem[] = [
  { to: '/', label: 'Inicio', icon: 'spark' },
  { to: '/demo', label: 'Laboratorio DEMO', icon: 'spark' },
  { to: '/orders', label: 'Pedidos', icon: 'orders' },
  { to: '/chat', label: 'Conversaciones', icon: 'chat', shortLabel: 'Chats' },
  { to: '/agentes', label: 'Propuestas', icon: 'agents' },
  { to: '/directory', label: 'Oportunidades', icon: 'suppliers' },
  { to: '/proveedores', label: 'Proveedores', icon: 'suppliers', shortLabel: 'Prov.' },
  { to: '/bandeja', label: 'Bandeja', icon: 'inbox' },
  { to: '/finanzas', label: 'Caja', icon: 'finance' },
  { to: '/blockchain', label: 'Blockchain', icon: 'blockchain', shortLabel: 'Chain' },
  { to: '/ventas', label: 'Ventas', icon: 'finance' },
  { to: '/voz', label: 'PACO por voz', icon: 'chat' },
  { to: '/negocio', label: 'Mi negocio', icon: 'user' },
  { to: '/integraciones', label: 'Integraciones', icon: 'integrations', shortLabel: 'Config' },
];

/** The mobile tab bar shows only the most-used destinations; advanced destinations live under "Herramientas". */
export const primaryNavPaths = ['/', '/directory', '/orders', '/finanzas'];
