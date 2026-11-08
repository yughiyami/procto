import type { z } from 'zod';
import type {
  Order,
  Feasibility,
  Finance,
  EvidenceExport,
  PublicInvitation,
  IntegrationsStatus,
  InboxItem,
  Draft,
  Supplier,
  createOrderSchema,
  contributionSchema,
  publicContributionSchema,
  quoteSchema,
  movementSchema,
  invitationSchema,
  supplierSchema,
  ChatMessage,
  Conversation,
  OutboundMessage,
  AgentRun,
  AgentStep,
  AgentProposal,
  ProposalStatus,
  startRunSchema,
  decideProposalSchema,
} from '@izumi/contracts';
import { createHttpClient, type HttpClient, type HttpClientConfig } from './http.js';

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ContributionInput = z.infer<typeof contributionSchema>;
export type PublicContributionInput = z.infer<typeof publicContributionSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
export type MovementInput = z.infer<typeof movementSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type InvitationInput = z.infer<typeof invitationSchema>;

export type DeliveryInput = { quantity: number; reference: string };
export type InvitationResult = { token: string; path: string; expiresAt: string };

/** The supplier-side public form sends a contribution; the customer-side sends an acceptance. */
export type PublicCustomerAccept = { accept: true; version: number };
export type PublicSubmitBody = PublicContributionInput | PublicCustomerAccept;
export type PublicSubmitResult = { submitted: true; status: Order['status'] };

export type HealthResult = { status: string; service: string; integrations: string };

export type PrepareBlockchainInput =
  | { action: 'retain'; orderHash: string; seller: string; amountBaseUnits: string; releaseAt: number }
  | { action: 'release' | 'claim' | 'settleExpiredClaim'; orderHash: string };

/**
 * `GET /chat/conversations` row shape, per apps/api/src/chat-wiring.ts: a manually-built
 * camelCase projection that is NOT the contracts `Conversation` type — it omits `orgId`/
 * `createdAt` and adds an inbox preview and an unread count for the conversation list UI.
 */
export type ConversationSummary = {
  id: string;
  peer: string;
  displayName: string | null;
  orderId: string | null;
  supplierId: string | null;
  agentPaused: boolean;
  autoReply?: boolean;
  lastMessageAt: string;
  preview: string | null;
  unreadCount: number;
};

/** Body accepted by `POST /chat/conversations/:id/messages` — conversationId comes from the URL, not this schema. */
export type SendChatMessageInput = { body?: string; media?: { kind: 'image' | 'sticker'; url: string }; promotion?: boolean; confirmPromotionConsent?: true };

/** `POST /chat/conversations/:id/messages` result. The route maps columns to camelCase. */
export type SentChatMessage = Pick<OutboundMessage, 'id' | 'conversationId' | 'body' | 'status' | 'createdAt'>;

/** Body for `POST /chat/conversations/:id/link`. Each key is independently optional: the route only touches the columns present in the body (checked via `'orderId' in body`), so omitting a key leaves it unchanged rather than clearing it. */
export type LinkConversationInput = { orderId?: string | null; supplierId?: string | null };

export type ConversationLinkResult = Pick<Conversation, 'id' | 'orderId' | 'supplierId'>;

/** Body for `POST /chat/conversations/:id/agent`. */
export type SetConversationAgentInput = { paused: boolean; autoReply?: boolean };

export type ConversationAgentResult = Pick<Conversation, 'id' | 'agentPaused' | 'autoReply'>;

/** Body for `POST /chat/simulate/inbound`. */
export type SimulateInboundInput = { peer: string; text: string };

export type SimulateInboundResult = { received: true; duplicate: boolean; conversationId: string };

export type StartAgentRunInput = z.infer<typeof startRunSchema>;
export type DecideProposalInput = z.infer<typeof decideProposalSchema>;

/** `GET /agents/runs/:id` result: the run plus its ordered steps. */
export type AgentRunDetail = AgentRun & { steps: AgentStep[] };

export type IzumiClientConfig = HttpClientConfig;

/**
 * One typed method per route from docs/frontend-contract.md's API surface table. Idempotency
 * keys are always a required parameter here — the caller owns one key per user intent so a
 * retry of that same intent can reuse it; this client never generates keys on its own
 * (see keys.ts `newIdempotencyKey`).
 */
export function createIzumiClient(config: IzumiClientConfig) {
  const http: HttpClient = createHttpClient(config);

  return {
    health: () => http.request<HealthResult>('GET', '/health'),
    integrationsStatus: () => http.request<IntegrationsStatus>('GET', '/integrations/status'),

    listSuppliers: () => http.request<Supplier[]>('GET', '/suppliers'),
    createSupplier: (input: SupplierInput) => http.request<Supplier>('POST', '/suppliers', { body: input }),

    listOrders: () => http.request<Order[]>('GET', '/orders'),
    createOrder: (input: CreateOrderInput, idempotencyKey: string) =>
      http.request<Order>('POST', '/orders', { body: input, idempotencyKey }),
    getOrder: (id: string) => http.request<Order>('GET', `/orders/${id}`),

    getFeasibility: (id: string) => http.request<Feasibility>('GET', `/orders/${id}/feasibility`),
    getFinance: (id: string) => http.request<Finance>('GET', `/orders/${id}/finance`),
    getEvidence: (id: string) => http.request<EvidenceExport>('GET', `/orders/${id}/evidence`),

    addContribution: (id: string, input: ContributionInput, idempotencyKey: string) =>
      http.request<Order>('POST', `/orders/${id}/contributions`, { body: input, idempotencyKey }),
    createQuote: (id: string, input: QuoteInput, idempotencyKey: string) =>
      http.request<Order>('POST', `/orders/${id}/quote`, { body: input, idempotencyKey }),
    acceptQuote: (id: string, version: number, idempotencyKey: string) =>
      http.request<Order>('POST', `/orders/${id}/accept`, { body: { version }, idempotencyKey }),
    addDelivery: (id: string, input: DeliveryInput, idempotencyKey: string) =>
      http.request<Order>('POST', `/orders/${id}/deliveries`, { body: input, idempotencyKey }),
    addMovement: (id: string, input: MovementInput, idempotencyKey: string) =>
      http.request<Order>('POST', `/orders/${id}/movements`, { body: input, idempotencyKey }),
    cancelOrder: (id: string, idempotencyKey: string) =>
      http.request<Order>('POST', `/orders/${id}/cancel`, { body: {}, idempotencyKey }),

    createInvitation: (id: string, input: InvitationInput, idempotencyKey: string) =>
      http.request<InvitationResult>('POST', `/orders/${id}/invitations`, { body: input, idempotencyKey }),

    getPublicInvitation: (token: string) => http.request<PublicInvitation>('GET', `/public/invitations/${token}`),
    submitPublicInvitation: (token: string, body: PublicSubmitBody) =>
      http.request<PublicSubmitResult>('POST', `/public/invitations/${token}`, { body }),

    listInbox: () => http.request<InboxItem[]>('GET', '/inbox'),
    extractInbox: (id: string) => http.request<{ id: string; data: unknown }>('POST', `/inbox/${id}/extract`),
    listDrafts: () => http.request<Draft[]>('GET', '/drafts'),

    prepareBlockchain: (input: PrepareBlockchainInput) =>
      http.request<unknown>('POST', '/blockchain/prepare', { body: input }),
    readDeal: (orderHash: string) => http.request<unknown>('GET', `/blockchain/deals/${orderHash}`),

    // --- Chat (apps/api/src/chat-wiring.ts) ---
    listConversations: () => http.request<ConversationSummary[]>('GET', '/chat/conversations'),
    createConversation: (input: { phone: string; displayName?: string }) =>
      http.request<{ id: string; peer: string; displayName: string | null }>('POST', '/chat/conversations', { body: input }),
    getConversation: (id: string) => http.request<ChatMessage[]>('GET', `/chat/conversations/${id}`),
    // Requires Idempotency-Key: this route goes through chat-wiring.ts's local `mutation()`
    // helper, which parses the `Idempotency-Key` header and 400s without it.
    sendChatMessage: (id: string, input: SendChatMessageInput, idempotencyKey: string) =>
      http.request<SentChatMessage>('POST', `/chat/conversations/${id}/messages`, { body: input, idempotencyKey }),
    // No Idempotency-Key: a plain UPDATE with no `mutation()`/`withIdempotency()` wrapper.
    linkConversation: (id: string, input: LinkConversationInput) =>
      http.request<ConversationLinkResult>('POST', `/chat/conversations/${id}/link`, { body: input }),
    // No Idempotency-Key: same as above, a plain UPDATE.
    setConversationAgent: (id: string, input: SetConversationAgentInput) =>
      http.request<ConversationAgentResult>('POST', `/chat/conversations/${id}/agent`, { body: input }),
    // No Idempotency-Key: dedupes instead via a deterministic synthetic message id derived
    // from (peer, text), the same way a real WhatsApp provider retry would.
    simulateInbound: (input: SimulateInboundInput) =>
      http.request<SimulateInboundResult>('POST', '/chat/simulate/inbound', { body: input }),

    // --- Agents (apps/api/src/agent-wiring.ts) ---
    // Requires Idempotency-Key: goes through agent-wiring.ts's `withIdempotency()`, which
    // parses the header the same way app.ts's `mutation()` does and replays a cached
    // response for a repeated key.
    startAgentRun: (input: StartAgentRunInput, idempotencyKey: string) =>
      http.request<AgentRun>('POST', '/agents/runs', { body: input, idempotencyKey }),
    listAgentRuns: () => http.request<AgentRun[]>('GET', '/agents/runs'),
    getAgentRun: (id: string) => http.request<AgentRunDetail>('GET', `/agents/runs/${id}`),
    listProposals: (status?: ProposalStatus) =>
      http.request<AgentProposal[]>('GET', `/agents/proposals${status ? `?status=${status}` : ''}`),
    // Requires Idempotency-Key: also goes through `withIdempotency()` — this is THE GATE that
    // applies a proposal's domain mutation, so a retried approval must be a safe no-op.
    decideProposal: (id: string, input: DecideProposalInput, idempotencyKey: string) =>
      http.request<AgentProposal>('POST', `/agents/proposals/${id}/decide`, { body: input, idempotencyKey }),
  };
}

export type IzumiClient = ReturnType<typeof createIzumiClient>;
