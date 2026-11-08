/**
 * Drop-in replacement for the HTTP `createIzumiClient`: same method names and
 * result shapes for the pages we kept, backed by the browser LocalStore.
 */
import { ZodError } from 'zod';
import { ApiError } from '@izumi/api-client';
import type {
  ContributionInput,
  CreateOrderInput,
  DeliveryInput,
  InvitationInput,
  InvitationResult,
  MovementInput,
  PublicSubmitBody,
  PublicSubmitResult,
  QuoteInput,
  SupplierInput,
} from '@izumi/api-client';
import { acceptSchema, publicContributionSchema, supplierSchema } from '@izumi/contracts';
import type { EvidenceExport, Feasibility, Finance, Order, PublicInvitation, Supplier } from '@izumi/contracts';
import {
  acceptOrder,
  addContribution,
  addMovement,
  cancelOrder,
  createOrder,
  DomainError,
  deliverOrder,
  feasibility,
  finance,
  quoteOrder,
} from './domain';
import { randomHex, randomId } from './hash';
import type { LocalStore, StoredInvitation } from './localStore';

const clone = <T>(value: T): T => structuredClone(value);

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(400, { error: 'Datos inválidos', issues: error.issues });
  }
  if (error instanceof DomainError) return new ApiError(409, { error: error.message });
  return new ApiError(500, { error: error instanceof Error ? error.message : 'Error inesperado' });
}

async function guarded<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toApiError(error);
  }
}

export function createLocalClient(store: LocalStore) {
  async function orderById(id: string): Promise<Order> {
    await store.init();
    const order = store.state.orders.find((o) => o.id === id);
    if (!order) throw new ApiError(404, { error: 'Pedido no encontrado.' }, 'domain');
    return order;
  }

  /** Runs a mutation on a draft copy; commits only if it succeeds. */
  async function mutate(id: string, fn: (order: Order) => Promise<void>): Promise<Order> {
    return guarded(async () => {
      const current = await orderById(id);
      const draft = clone(current);
      await fn(draft);
      const index = store.state.orders.findIndex((o) => o.id === id);
      store.state.orders[index] = draft;
      store.persist();
      return clone(draft);
    });
  }

  async function findInvitation(token: string): Promise<StoredInvitation> {
    await store.init();
    const inv = store.state.invitations.find((i) => i.token === token && Date.parse(i.expiresAt) > Date.now());
    if (!inv) throw new ApiError(409, { error: 'Invitación no encontrada o vencida.' });
    return inv;
  }

  return {
    listSuppliers: (): Promise<Supplier[]> =>
      guarded(async () => {
        await store.init();
        return clone(store.state.suppliers);
      }),
    createSupplier: (input: SupplierInput): Promise<Supplier> =>
      guarded(async () => {
        await store.init();
        const parsed = supplierSchema.parse(input);
        const supplier: Supplier = { id: randomId(), name: parsed.name };
        store.state.suppliers.push(supplier);
        store.persist();
        return clone(supplier);
      }),

    listOrders: (): Promise<Order[]> =>
      guarded(async () => {
        await store.init();
        return clone(store.state.orders);
      }),
    getOrder: (id: string): Promise<Order> => guarded(async () => clone(await orderById(id))),
    createOrder: (input: CreateOrderInput, _idempotencyKey?: string): Promise<Order> =>
      guarded(async () => {
        await store.init();
        const order = await createOrder(input, 'coordinadora');
        store.state.orders.unshift(order);
        store.persist();
        return clone(order);
      }),

    getFeasibility: (id: string): Promise<Feasibility> => guarded(async () => feasibility(await orderById(id))),
    getFinance: (id: string): Promise<Finance> => guarded(async () => finance(await orderById(id))),
    getEvidence: (id: string): Promise<EvidenceExport> =>
      guarded(async () => ({
        chainStatus: 'not_anchored' as const,
        algorithm: 'sha256-json-v1',
        events: clone((await orderById(id)).events),
        warning:
          'Registro interno encadenado con hashes. No prueba la entrega física; el comprobante en la red Stellar registra los pagos.',
      })),

    addContribution: (id: string, input: ContributionInput, _k?: string) =>
      mutate(id, (o) => addContribution(o, input, 'coordinadora')),
    createQuote: (id: string, input: QuoteInput, _k?: string) => mutate(id, (o) => quoteOrder(o, input, 'coordinadora')),
    acceptQuote: (id: string, version: number, _k?: string) =>
      mutate(id, (o) => acceptOrder(o, acceptSchema.parse({ version }).version, 'comprador')),
    addDelivery: (id: string, input: DeliveryInput, _k?: string) => mutate(id, (o) => deliverOrder(o, input, 'coordinadora')),
    addMovement: (id: string, input: MovementInput, _k?: string) => mutate(id, (o) => addMovement(o, input, 'coordinadora')),
    cancelOrder: (id: string, _k?: string) => mutate(id, (o) => cancelOrder(o, 'coordinadora')),

    createInvitation: (id: string, input: InvitationInput, _k?: string): Promise<InvitationResult> =>
      guarded(async () => {
        const order = await orderById(id);
        if (Date.parse(input.expiresAt) <= Date.now() || Date.parse(input.expiresAt) > Date.now() + 7 * 86_400_000) {
          throw new DomainError('La invitación debe vencer dentro de los próximos siete días.');
        }
        if (input.purpose === 'customer' && (order.status !== 'quoted' || !order.quote)) {
          throw new DomainError('Primero genera una cotización.');
        }
        if (input.purpose === 'supplier' && !store.state.suppliers.some((s) => s.id === input.supplierId)) {
          throw new DomainError('Proveedor no encontrado.');
        }
        const token = randomHex(32);
        store.state.invitations.push({
          token,
          orderId: id,
          supplierId: input.supplierId ?? null,
          purpose: input.purpose,
          quoteVersion: order.quote?.version ?? null,
          expiresAt: input.expiresAt,
          usedAt: null,
        });
        store.persist();
        return { token, path: `/i/${token}`, expiresAt: input.expiresAt };
      }),

    getPublicInvitation: (token: string): Promise<PublicInvitation> =>
      guarded(async () => {
        const inv = await findInvitation(token);
        const o = await orderById(inv.orderId);
        return {
          purpose: inv.purpose,
          used: inv.usedAt !== null,
          title: o.title,
          specification: o.specification,
          quantity: o.quantity,
          dueAt: o.dueAt,
          ...(inv.purpose === 'customer'
            ? {
                quote: o.quote
                  ? { version: o.quote.version, priceCents: o.quote.priceCents, validUntil: o.quote.validUntil, currency: o.currency }
                  : null,
              }
            : {}),
        };
      }),
    submitPublicInvitation: (token: string, body: PublicSubmitBody): Promise<PublicSubmitResult> =>
      guarded(async () => {
        const inv = await findInvitation(token);
        if (inv.usedAt) throw new DomainError('La invitación ya fue respondida.');
        const current = await orderById(inv.orderId);
        const draft = clone(current);
        if (inv.purpose === 'customer') {
          const version = acceptSchema.parse({ version: (body as { version: number }).version }).version;
          if (version !== inv.quoteVersion) throw new DomainError('La cotización de la invitación cambió.');
          await acceptOrder(draft, version, 'cliente-invitacion');
        } else {
          const parsed = publicContributionSchema.parse(body);
          await addContribution(draft, { ...parsed, supplierId: inv.supplierId }, `proveedor:${inv.supplierId}`);
        }
        store.state.orders[store.state.orders.findIndex((o) => o.id === draft.id)] = draft;
        inv.usedAt = new Date().toISOString();
        store.persist();
        return { submitted: true as const, status: draft.status };
      }),
  };
}

export type LocalClient = ReturnType<typeof createLocalClient>;
