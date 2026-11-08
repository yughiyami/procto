import type { z } from 'zod';
import type {
  createOrderSchema,
  contributionSchema,
  quoteSchema,
  movementSchema,
  invitationSchema,
  supplierSchema,
  requestDraftSchema,
  inboundMessageSchema,
} from './schemas.js';

export type OrderStatus = 'draft' | 'quoted' | 'accepted' | 'fulfilling' | 'delivered' | 'cancelled';

export type MovementKind = 'customer_receipt' | 'supplier_payment' | 'other_cost' | 'customer_refund';

/** The server assigns `id`; everything else comes straight from the input schema. */
export type Contribution = z.infer<typeof contributionSchema> & { id: string };

/** `version`, `costCents` and `contributionCents` are computed server-side, never sent by the client. */
export type Quote = z.infer<typeof quoteSchema> & {
  version: number;
  costCents: number;
  contributionCents: number;
};

export type Movement = z.infer<typeof movementSchema>;

export type DomainEvent = {
  id: string;
  type: string;
  at: string;
  actor: string;
  data: unknown;
  salt: string;
  hash: string;
  previousHash: string;
};

export type Order = z.infer<typeof createOrderSchema> & {
  id: string;
  status: OrderStatus;
  version: number;
  contributions: Contribution[];
  quote?: Quote;
  accepted?: { version: number; at: string; actor: string };
  deliveries: { quantity: number; reference: string }[];
  movements: (Movement & { id: string })[];
  events: DomainEvent[];
};

export type Feasibility = {
  feasible: boolean;
  reasons: string[];
  totalQuantity: number;
  costCents: number;
};

export type Finance = {
  currency: 'PEN';
  receivedNetCents: number;
  paidCostsCents: number;
  /** Not profit — always render the server's `warning` alongside this value. */
  cashDifferenceCents: number;
  estimatedContributionCents: number | null;
  customerBalanceCents: number | null;
  warning: string;
};

export type PublicInvitation = {
  purpose: 'supplier' | 'customer';
  used: boolean;
  title: string;
  specification: string;
  quantity: number;
  dueAt: string;
  quote?: { version: number; priceCents: number; validUntil: string; currency: 'PEN' } | null;
};

export type EvidenceExport = {
  /** Always 'not_anchored' today — the UI must say so plainly, never imply on-chain proof. */
  chainStatus: 'not_anchored';
  algorithm: string;
  events: DomainEvent[];
  warning: string;
};

export type IntegrationsStatus = {
  // `configured` only means the env vars are present; `connected` stays 'not_verified'
  // because nothing here proves the integration actually works.
  wapi: {
    configured: boolean;
    connected: string;
    transport: string;
    mode: 'live' | 'simulator';
    outgoingEnabled: boolean;
    simulated: boolean;
  };
  deepseek: { configured: boolean; connected: string; model: string };
  blockchain: {
    configured: boolean;
    connected: string;
    chainId: number;
    signingEnabled: boolean;
    evidenceAnchoring: boolean;
  };
};

/** The DeepSeek extraction result — mirrors `RequestDraft` in apps/api/src/integrations/deepseek.ts. */
export type RequestDraft = z.infer<typeof requestDraftSchema> & { requiresHumanConfirmation: true };

/** The normalized WhatsApp message — mirrors `InboundMessage` in apps/api/src/integrations/wapi.ts. */
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export type InboxItem = {
  id: string;
  payload: InboundMessage;
  status: string;
  created_at: string;
};

export type Draft = {
  id: string;
  inbox_id: string;
  data: RequestDraft;
  created_at: string;
};

export type Supplier = z.infer<typeof supplierSchema> & { id: string };

/** Input fields plus the server-issued token/path returned by POST /orders/:id/invitations. */
export type Invitation = z.infer<typeof invitationSchema> & { token: string; path: string };
