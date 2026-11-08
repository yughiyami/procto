import type { Order, Supplier } from '@izumi/contracts';
import { buildSeed } from './seed';

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type StoredInvitation = {
  token: string;
  orderId: string;
  supplierId: string | null;
  purpose: 'supplier' | 'customer';
  quoteVersion: number | null;
  expiresAt: string;
  usedAt: string | null;
};

export type ChainShare = {
  /** Local supplier id; null for the coordinator's own share. */
  supplierId: string | null;
  label: string;
  /** Stellar account that gets paid for this share. */
  address: string;
  amountCents: number;
  /** Token units (7 decimals) as a decimal string. */
  amountUnits: string;
};

export type ChainTxKind =
  | 'create_order'
  | 'fund'
  | 'mark_delivered'
  | 'confirm_delivery'
  | 'offer_share'
  | 'buy_share'
  | 'cancel_offer'
  | 'refund_expired';

export type ChainTx = {
  kind: ChainTxKind;
  hash: string;
  at: string;
  by: string;
  shareIndex?: number;
  /** True when the network fee was paid by the sponsor account. */
  sponsored?: boolean;
};

/** Link between a local order and its protected-payment order on the contract. */
export type ChainLink = {
  chainOrderId: string;
  token: 'PUSD' | 'USDC';
  tokenContract: string;
  buyer: string;
  deadline: number;
  shares: ChainShare[];
  txs: ChainTx[];
};

export type StoreState = {
  version: 1;
  orders: Order[];
  suppliers: Supplier[];
  /** supplierId -> Stellar address. */
  supplierWallets: Record<string, string>;
  invitations: StoredInvitation[];
  /** local order id -> chain link */
  chain: Record<string, ChainLink>;
};

const STORAGE_KEY = 'procto.store.v1';

/**
 * Offline-first persistence for the whole app: orders, suppliers and the link
 * to the on-chain order live in localStorage. No server is needed.
 */
export class LocalStore {
  state: StoreState = emptyState();
  private listeners = new Set<() => void>();
  private ready: Promise<void> | null = null;

  constructor(private readonly storage: StorageLike | null) {}

  init(): Promise<void> {
    this.ready ??= this.load().then(() => {
      this.snapshot++;
      this.listeners.forEach((fn) => fn());
    });
    return this.ready;
  }

  private async load(): Promise<void> {
    const raw = this.read();
    if (raw) {
      this.state = raw;
      return;
    }
    this.state = await buildSeed();
    this.persist();
  }

  private read(): StoreState | null {
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      if (!text) return null;
      const parsed = JSON.parse(text) as StoreState;
      return parsed.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Increments on every change so React can subscribe with useSyncExternalStore. */
  snapshot = 0;
  getSnapshot = () => this.snapshot;

  persist(): void {
    this.snapshot++;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage may be full or blocked (private mode): keep working in memory.
    }
    this.listeners.forEach((fn) => fn());
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  async reset(): Promise<void> {
    this.state = await buildSeed();
    this.persist();
  }

  getChain(orderId: string): ChainLink | undefined {
    return this.state.chain[orderId];
  }

  setChain(orderId: string, link: ChainLink): void {
    this.state.chain[orderId] = link;
    this.persist();
  }

  addChainTx(orderId: string, tx: ChainTx): void {
    const link = this.state.chain[orderId];
    if (!link) return;
    if (!link.txs.some((t) => t.hash === tx.hash)) link.txs.push(tx);
    this.persist();
  }

  supplierWallet(supplierId: string): string | undefined {
    return this.state.supplierWallets[supplierId];
  }

  setSupplierWallet(supplierId: string, address: string): void {
    this.state.supplierWallets[supplierId] = address;
    this.persist();
  }

  /** Local order id for a given on-chain order id, if this browser created or imported it. */
  findLocalOrderByChainId(chainOrderId: string): Order | undefined {
    const entry = Object.entries(this.state.chain).find(([, link]) => link.chainOrderId === chainOrderId);
    return entry ? this.state.orders.find((o) => o.id === entry[0]) : undefined;
  }
}

function emptyState(): StoreState {
  return { version: 1, orders: [], suppliers: [], supplierWallets: {}, invitations: [], chain: {} };
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
