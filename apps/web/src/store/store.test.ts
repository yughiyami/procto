import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@izumi/api-client';
import { createLocalClient } from './client';
import { verifyEvidence } from './domain';
import { LocalStore, type StorageLike } from './localStore';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('local store seed', () => {
  it('seeds a quoted, feasible Arequipa alpaca order with named suppliers', async () => {
    const store = new LocalStore(memoryStorage());
    await store.init();
    const client = createLocalClient(store);
    const orders = await client.listOrders();
    const seeded = orders.find((o) => o.title.includes('chompas de alpaca'));
    expect(seeded).toBeDefined();
    expect(seeded!.quantity).toBe(300);
    expect(seeded!.status).toBe('quoted');
    expect((await client.getFeasibility(seeded!.id)).feasible).toBe(true);
    const suppliers = await client.listSuppliers();
    expect(suppliers.map((s) => s.name)).toEqual(expect.arrayContaining(['Taller de tejido Colca', 'Taller de bordado Misti']));
    store.setSupplierWallet(suppliers[0]!.id, 'G'.padEnd(56, 'A'));
    expect(store.supplierWallet(suppliers[0]!.id)).toHaveLength(56);
  });

  it('persists to storage and reloads without reseeding', async () => {
    const storage = memoryStorage();
    const a = new LocalStore(storage);
    await a.init();
    const client = createLocalClient(a);
    await client.createSupplier({ name: 'Nuevo taller' });
    const b = new LocalStore(storage);
    await b.init();
    expect((await createLocalClient(b).listSuppliers()).map((s) => s.name)).toContain('Nuevo taller');
  });
});

describe('local client order flow', () => {
  let client: ReturnType<typeof createLocalClient>;
  let store: LocalStore;
  beforeEach(async () => {
    store = new LocalStore(memoryStorage());
    await store.init();
    client = createLocalClient(store);
  });

  it('quotes and accepts the seeded order and keeps a verifiable hash chain', async () => {
    const [seeded] = (await client.listOrders()).filter((o) => o.status === 'quoted');
    const accepted = await client.acceptQuote(seeded!.id, seeded!.quote!.version, 'k1');
    expect(accepted.status).toBe('accepted');
    expect(accepted.accepted?.version).toBe(seeded!.quote!.version);
    expect(await verifyEvidence(accepted.events)).toBe(true);
    const evidence = await client.getEvidence(seeded!.id);
    expect(evidence.chainStatus).toBe('not_anchored');
    // Tampering is detected.
    const tampered = structuredClone(accepted.events);
    (tampered[0]!.data as { title: string }).title = 'otra cosa';
    expect(await verifyEvidence(tampered)).toBe(false);
  });

  it('maps domain rule failures to 409 ApiErrors with the business message', async () => {
    const [seeded] = (await client.listOrders()).filter((o) => o.status === 'quoted');
    await expect(client.acceptQuote(seeded!.id, 999, 'k')).rejects.toMatchObject({ status: 409, kind: 'domain' });
    await expect(client.addDelivery(seeded!.id, { quantity: 1, reference: 'x' }, 'k')).rejects.toBeInstanceOf(ApiError);
  });

  it('maps validation failures to 400 ApiErrors with field issues', async () => {
    await expect(
      client.createOrder({ title: '', specification: 'x', quantity: 1, dueAt: iso(10), ownQuantity: 0, ownCostCents: 0, currency: 'PEN' }, 'k'),
    ).rejects.toMatchObject({ status: 400, kind: 'invalid_input' });
  });

  it('returns 404 for unknown orders', async () => {
    await expect(client.getOrder('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('creates an order from scratch and computes finance after accepting', async () => {
    const order = await client.createOrder(
      { title: '50 gorros', specification: 'Gorro de alpaca', quantity: 50, dueAt: iso(30), ownQuantity: 50, ownCostCents: 100_000, currency: 'PEN' },
      'k',
    );
    expect(order.status).toBe('draft');
    const quoted = await client.createQuote(order.id, { priceCents: 150_000, logisticsCents: 5_000, coordinationCents: 5_000, validUntil: iso(10) }, 'k');
    expect(quoted.quote?.contributionCents).toBe(40_000);
    const accepted = await client.acceptQuote(order.id, quoted.quote!.version, 'k');
    await client.addMovement(order.id, { kind: 'customer_receipt', amountCents: 150_000, reference: 'r1', counterparty: 'Tienda', verification: 'declared', note: '' }, 'k');
    const fin = await client.getFinance(accepted.id);
    expect(fin.receivedNetCents).toBe(150_000);
    expect(fin.customerBalanceCents).toBe(0);
  });
});

describe('invitations', () => {
  it('lets a supplier answer once through a public link', async () => {
    const store = new LocalStore(memoryStorage());
    await store.init();
    const client = createLocalClient(store);
    const order = await client.createOrder(
      { title: '40 guantes', specification: 'Guantes de alpaca', quantity: 40, dueAt: iso(30), ownQuantity: 0, ownCostCents: 0, currency: 'PEN' },
      'k',
    );
    const supplier = (await client.listSuppliers())[0]!;
    const inv = await client.createInvitation(order.id, { purpose: 'supplier', supplierId: supplier.id, expiresAt: iso(3) }, 'k');
    const pub = await client.getPublicInvitation(inv.token);
    expect(pub.purpose).toBe('supplier');
    expect(pub.used).toBe(false);
    const body = { specification: 'Guantes de alpaca', quantity: 40, unitCostCents: 1_500, availableAt: iso(20), validUntil: iso(25), confirmed: true };
    const res = await client.submitPublicInvitation(inv.token, body);
    expect(res.submitted).toBe(true);
    expect((await client.getOrder(order.id)).contributions).toHaveLength(1);
    await expect(client.submitPublicInvitation(inv.token, body)).rejects.toMatchObject({ status: 409 });
  });
});

describe('chain link persistence', () => {
  it('stores the on-chain order mapping and transaction log per order', async () => {
    const storage = memoryStorage();
    const store = new LocalStore(storage);
    await store.init();
    const [o] = await createLocalClient(store).listOrders();
    store.setChain(o!.id, {
      chainOrderId: '7',
      token: 'PUSD',
      tokenContract: 'C'.padEnd(56, 'A'),
      buyer: 'G'.padEnd(56, 'A'),
      deadline: 1_800_000_000,
      shares: [],
      txs: [{ kind: 'create_order', hash: 'ab'.repeat(32), at: new Date().toISOString(), by: 'G'.padEnd(56, 'A') }],
    });
    const again = new LocalStore(storage);
    await again.init();
    expect(again.getChain(o!.id)?.chainOrderId).toBe('7');
    expect(again.getChain(o!.id)?.txs).toHaveLength(1);
  });
});
