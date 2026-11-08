import type { Order, Supplier } from '@izumi/contracts';
import { addContribution, createOrder, quoteOrder } from './domain';
import type { StoreState } from './localStore';
import { randomId } from './hash';

const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const SPEC = 'Chompa de alpaca baby, cuello redondo, tallas S-M-L, color natural y gris perla, bordado en el pecho.';

/**
 * A textile coordinator in Arequipa: she answers a Lima shop's order for 300
 * alpaca sweaters by combining a knitting workshop, an embroidery workshop and
 * her own production. The order arrives already quoted so the demo can start at
 * "accept the quote -> protected payment".
 */
export async function buildSeed(): Promise<StoreState> {
  const weaving: Supplier = { id: randomId(), name: 'Taller de tejido Colca' };
  const embroidery: Supplier = { id: randomId(), name: 'Taller de bordado Misti' };

  const main = await createOrder(
    {
      title: '300 chompas de alpaca para tienda en Lima',
      specification: SPEC,
      quantity: 300,
      dueAt: iso(21),
      ownQuantity: 60,
      ownCostCents: 60 * 8_500,
      currency: 'PEN',
    },
    'coordinadora',
  );
  await addContribution(
    main,
    { supplierId: weaving.id, specification: SPEC, quantity: 150, unitCostCents: 9_200, availableAt: iso(14), validUntil: iso(18), confirmed: true },
    'coordinadora',
  );
  await addContribution(
    main,
    { supplierId: embroidery.id, specification: SPEC, quantity: 90, unitCostCents: 8_800, availableAt: iso(15), validUntil: iso(18), confirmed: true },
    'coordinadora',
  );
  // cost = 60*85 + 150*92 + 90*88 = 26,820; price leaves ~S/ 1,680 for the coordinator.
  await quoteOrder(
    main,
    { priceCents: 3_000_000, logisticsCents: 60_000, coordinationCents: 90_000, validUntil: iso(14) },
    'coordinadora',
  );

  const second: Order = await createOrder(
    {
      title: '80 ponchos tejidos para feria en Cusco',
      specification: 'Poncho de alpaca, diseños andinos, talla única.',
      quantity: 80,
      dueAt: iso(35),
      ownQuantity: 0,
      ownCostCents: 0,
      currency: 'PEN',
    },
    'coordinadora',
  );

  return {
    version: 1,
    orders: [main, second],
    suppliers: [weaving, embroidery],
    supplierWallets: {},
    invitations: [],
    chain: {},
  };
}
