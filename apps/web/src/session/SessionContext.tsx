import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Signer } from '../stellar/signer';
import {
  connectQuickWallet,
  connectWithKit,
  disconnectKit,
  signerFor,
  quickWalletAddress,
} from '../stellar/wallet';
import type { WalletConnection } from '../stellar/wallet';

export type Role = 'coordinadora' | 'comprador' | 'proveedor' | 'inversionista';

export const ROLES: Array<{ id: Role; label: string; description: string; home: string }> = [
  { id: 'coordinadora', label: 'Coordinadora', description: 'Organiza el pedido y a los talleres', home: '/orders' },
  { id: 'comprador', label: 'Comprador', description: 'Acepta la cotización y deposita el pago', home: '/orders' },
  { id: 'proveedor', label: 'Proveedor', description: 'Taller que entrega y cobra', home: '/proveedor' },
  { id: 'inversionista', label: 'Inversionista', description: 'Adelanta pagos protegidos', home: '/adelantos' },
];

type Stored = { role: Role; workshopId: string | null; connections: Record<string, WalletConnection> };
const KEY = 'procto.session.v1';

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // ignore corrupted state
  }
  return { role: 'coordinadora', workshopId: null, connections: {} };
}

type SessionValue = {
  role: Role;
  setRole: (role: Role) => void;
  /** For the provider role: which workshop the person is acting as. */
  workshopId: string | null;
  setWorkshopId: (id: string | null) => void;
  slot: string;
  connection: WalletConnection | null;
  signer: Signer | null;
  connecting: boolean;
  connectExternal: () => Promise<void>;
  connectQuick: () => Promise<WalletConnection>;
  disconnect: () => Promise<void>;
  /** Public address already linked to a slot in this browser (for demo shortcuts). */
  addressOfSlot: (slot: string) => string | null;
  ensureQuickSlot: (slot: string) => WalletConnection;
  signerOfSlot: (slot: string) => Signer | null;
};

const Ctx = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // storage unavailable: session lives in memory only
    }
  }, [state]);

  const slot = state.role === 'proveedor' ? `proveedor:${state.workshopId ?? 'default'}` : state.role;
  const connection = state.connections[slot] ?? null;

  const saveConnection = useCallback((targetSlot: string, c: WalletConnection | null) => {
    setState((s) => {
      const connections = { ...s.connections };
      if (c) connections[targetSlot] = c;
      else delete connections[targetSlot];
      return { ...s, connections };
    });
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      role: state.role,
      setRole: (role) => setState((s) => ({ ...s, role })),
      workshopId: state.workshopId,
      setWorkshopId: (workshopId) => setState((s) => ({ ...s, workshopId })),
      slot,
      connection,
      signer: connection ? signerFor(connection, slot) : null,
      connecting,
      async connectExternal() {
        setConnecting(true);
        try {
          saveConnection(slot, await connectWithKit());
        } finally {
          setConnecting(false);
        }
      },
      async connectQuick() {
        const c = connectQuickWallet(slot);
        saveConnection(slot, c);
        return c;
      },
      async disconnect() {
        if (connection?.kind === 'kit') await disconnectKit();
        saveConnection(slot, null);
      },
      addressOfSlot: (target) => state.connections[target]?.address ?? quickWalletAddress(target),
      ensureQuickSlot(target) {
        const c = connectQuickWallet(target);
        saveConnection(target, c);
        return c;
      },
      signerOfSlot(target) {
        const stored = state.connections[target];
        if (stored) return signerFor(stored, target);
        // Quick wallets created a moment ago may not be in React state yet.
        const quick = quickWalletAddress(target);
        return quick ? signerFor({ kind: 'quick', address: quick }, target) : null;
      },
    }),
    [state, slot, connection, connecting, saveConnection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
