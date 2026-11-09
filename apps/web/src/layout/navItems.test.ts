import { describe, expect, it } from 'vitest';
import { barItemsFor, groupedNavFor, navFor, navItems } from './navItems';
import type { Role } from '../session/SessionContext';

const ROLES: Role[] = ['coordinadora', 'comprador', 'proveedor', 'inversionista'];

describe('navigation', () => {
  it('groups every item under Operación, Red, Finanzas or Ayuda in that order', () => {
    expect(groupedNavFor('coordinadora').map((g) => g.label)).toEqual(['Operación', 'Red', 'Finanzas', 'Ayuda']);
  });

  it('has unique destinations', () => {
    const paths = navItems.map((i) => i.to);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(ROLES)('%s always reaches PACO, the wallet and the guide', (role) => {
    const paths = navFor(role).map((i) => i.to);
    expect(paths).toEqual(expect.arrayContaining(['/paco', '/cuenta', '/como-funciona']));
  });

  it('the coordinator reaches every restored section', () => {
    const paths = navFor('coordinadora').map((i) => i.to);
    for (const p of ['/directory', '/chat', '/agentes', '/bandeja', '/ventas', '/voz', '/integraciones', '/negocio', '/finanzas']) {
      expect(paths).toContain(p);
    }
  });

  it.each(ROLES)('%s has at most four pinned phone destinations and nothing is lost', (role) => {
    const { bar, more } = barItemsFor(role);
    expect(bar.length).toBeLessThanOrEqual(4);
    expect(bar.length + more.length).toBe(navFor(role).length);
  });
});
