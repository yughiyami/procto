import { z } from 'zod';

/**
 * These schemas mirror apps/api/src/domain.ts field-for-field (limits, `.strict()`, defaults).
 * The server is the source of truth — if this file and domain.ts ever disagree, domain.ts wins.
 * Cross-field rules the server checks in its handler functions (not in its zod schemas) are
 * reproduced here as `.refine()`s so forms can pre-check them before hitting the network.
 */

const money = z.number().int().min(0).max(1_000_000_000);
const quantity = z.number().int().min(1).max(100_000);

const isFutureIso = (value: string): boolean => Date.parse(value) > Date.now();

const orderObject = z
  .object({
    title: z.string().trim().min(1).max(200),
    specification: z.string().trim().min(1).max(4000),
    quantity,
    dueAt: z.iso.datetime(),
    ownQuantity: z.number().int().min(0).default(0),
    ownCostCents: money.default(0),
    currency: z.literal('PEN').default('PEN'),
  })
  .strict();

export const createOrderSchema = orderObject
  .refine((v) => v.ownQuantity <= v.quantity, {
    message: 'Own quantity exceeds requested quantity',
    path: ['ownQuantity'],
  })
  .refine((v) => isFutureIso(v.dueAt), { message: 'Due date must be in future', path: ['dueAt'] });

const contributionObject = z
  .object({
    supplierId: z.uuid(),
    specification: z.string().min(1).max(4000),
    quantity,
    unitCostCents: money,
    availableAt: z.iso.datetime(),
    validUntil: z.iso.datetime(),
    confirmed: z.boolean(),
  })
  .strict();

// Not `as const`: zod's refine params require a mutable PropertyKey[] for `path`.
const validUntilFuture = { message: 'Commitment expired', path: ['validUntil'] };

export const contributionSchema = contributionObject.refine((v) => isFutureIso(v.validUntil), validUntilFuture);

/** Same shape as `contributionSchema` minus `supplierId` — the server fills it in from the invitation. */
export const publicContributionSchema = contributionObject
  .omit({ supplierId: true })
  .refine((v) => isFutureIso(v.validUntil), validUntilFuture);

export const quoteSchema = z
  .object({
    priceCents: money,
    logisticsCents: money,
    coordinationCents: money,
    validUntil: z.iso.datetime(),
  })
  .strict()
  .refine((v) => isFutureIso(v.validUntil), { message: 'Quote expired', path: ['validUntil'] });

export const acceptSchema = z.object({ version: z.number().int() }).strict();

export const deliverySchema = z
  .object({
    quantity,
    reference: z.string().min(1).max(200),
  })
  .strict();

export const movementSchema = z
  .object({
    kind: z.enum(['customer_receipt', 'supplier_payment', 'other_cost', 'customer_refund']),
    amountCents: money,
    reference: z.string().min(1).max(200),
    counterparty: z.string().max(200),
    verification: z.enum(['declared', 'manually_verified']),
    note: z.string().max(1000).default(''),
  })
  .strict()
  .refine((v) => v.amountCents > 0, { message: 'Amount must be greater than zero', path: ['amountCents'] });

export const invitationSchema = z
  .object({
    purpose: z.enum(['supplier', 'customer']),
    supplierId: z.uuid().optional(),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .refine((v) => isFutureIso(v.expiresAt), {
    message: 'Invitation expiry must be in the future',
    path: ['expiresAt'],
  })
  .refine((v) => Date.parse(v.expiresAt) <= Date.now() + 7 * 86_400_000, {
    message: 'Invitation expiry must be within seven days',
    path: ['expiresAt'],
  });

export const supplierSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

/** Mirrors apps/api/src/integrations/deepseek.ts `requestDraftSchema` field-for-field. */
export const requestDraftSchema = z
  .object({
    product: z.string().min(1).max(500).nullable(),
    quantity: z.number().int().positive().max(1_000_000).nullable(),
    specifications: z.string().max(4000).nullable(),
    deadline: z.iso.datetime({ offset: true }).nullable(),
    missingFields: z.array(z.string().max(100)).max(20),
  })
  .strict();

/** Mirrors the `InboundMessage` shape normalized by apps/api/src/integrations/wapi.ts. */
export const inboundMessageSchema = z
  .object({
    dedupeKey: z.string().length(64),
    messageId: z.string().min(1).max(256),
    sessionId: z.number().int().positive(),
    sender: z.string().regex(/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/),
    text: z.string().min(1).max(16000),
  })
  .strict();
