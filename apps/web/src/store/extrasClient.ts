/**
 * Local implementation of the chat, inbox, agent and integrations endpoints of the old API.
 * Same method names and result shapes as @izumi/api-client, so the restored pages run unchanged.
 * Nothing leaves the browser: WhatsApp and the cloud assistants are reported as "not connected".
 */
import { ApiError } from '@izumi/api-client';
import type {
  ConversationAgentResult,
  ConversationLinkResult,
  AgentRunDetail,
  ConversationSummary,
  DecideProposalInput,
  LinkConversationInput,
  SentChatMessage,
  SetConversationAgentInput,
  SendChatMessageInput,
  SimulateInboundInput,
  SimulateInboundResult,
  StartAgentRunInput,
} from '@izumi/api-client';
import type {
  AgentProposal,
  AgentRun,
  AgentStep,
  ChatMessage,
  Draft,
  InboxItem,
  IntegrationsStatus,
  ProposalKind,
  ProposalStatus,
} from '@izumi/contracts';
import { composeSupplierQuestion, extractPriceQuote, extractRequestDraft } from '../assist/localRules';
import type { ExtrasStore, StoredConversation } from './extras';
import { randomHex, randomId } from './hash';

type OrderApi = {
  getOrder(id: string): Promise<{ id: string; title: string; specification: string; quantity: number; dueAt: string }>;
  createOrder(input: {
    title: string;
    specification: string;
    quantity: number;
    dueAt: string;
    ownQuantity: number;
    ownCostCents: number;
    currency: 'PEN';
  }): Promise<{ id: string }>;
  addContribution(
    id: string,
    input: {
      supplierId: string;
      specification: string;
      quantity: number;
      unitCostCents: number;
      availableAt: string;
      validUntil: string;
      confirmed: boolean;
    },
  ): Promise<unknown>;
  listSuppliers(): Promise<Array<{ id: string; name: string }>>;
};

const DAY = 86_400_000;
const clone = <T>(v: T): T => structuredClone(v);
const now = () => new Date().toISOString();
const notFound = (what: string) => new ApiError(404, { error: `${what} no encontrada.` }, 'domain');
const bad = (message: string) => new ApiError(409, { error: message }, 'domain');

export function createExtrasClient(extras: ExtrasStore, orders: OrderApi) {
  const s = () => extras.state;

  function conversationOf(id: string): StoredConversation {
    const conv = s().conversations.find((c) => c.id === id);
    if (!conv) throw notFound('Conversación');
    return conv;
  }

  function pushMessage(conversationId: string, message: ChatMessage) {
    (s().messages[conversationId] ??= []).push(message);
    conversationOf(conversationId).lastMessageAt = message.at;
  }

  function addRun(run: Omit<AgentRun, 'id' | 'orgId' | 'createdAt' | 'finishedAt'>, steps: Array<Pick<AgentStep, 'type' | 'name' | 'input' | 'output'>>): AgentRun {
    const full: AgentRun = { ...run, id: randomId(), orgId: 'local', createdAt: now(), finishedAt: now() };
    s().runs.unshift(full);
    s().steps[full.id] = steps.map((step, idx) => ({ ...step, id: randomId(), runId: full.id, idx, createdAt: now() }));
    return full;
  }

  function addProposal(runId: string, kind: ProposalKind, payload: unknown, rationale: string, links: { orderId?: string | null; conversationId?: string | null }): AgentProposal {
    const proposal: AgentProposal = {
      id: randomId(),
      orgId: 'local',
      runId,
      kind,
      orderId: links.orderId ?? null,
      conversationId: links.conversationId ?? null,
      payload,
      rationale,
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      operationKey: null,
      error: null,
      createdAt: now(),
    };
    s().proposals.unshift(proposal);
    return proposal;
  }

  const base = { orgId: 'local', conversationId: null, inboxId: null, orderId: null, error: null, tokensUsed: 0, maxSteps: 6 } as const;

  return {
    // ---- integrations -------------------------------------------------------------------
    integrationsStatus: async (): Promise<IntegrationsStatus> => ({
      wapi: { configured: false, connected: 'not_verified', transport: 'simulator', mode: 'simulator', outgoingEnabled: false, simulated: true },
      deepseek: { configured: false, connected: 'not_verified', model: 'reglas locales' },
      blockchain: { configured: true, connected: 'stellar_testnet', chainId: 0, signingEnabled: true, evidenceAnchoring: true },
    }),

    // ---- inbox --------------------------------------------------------------------------
    listInbox: async (): Promise<InboxItem[]> => clone(s().inbox),
    listDrafts: async (): Promise<Draft[]> => clone(s().drafts),
    extractInbox: async (id: string): Promise<{ id: string; data: unknown }> => {
      const item = s().inbox.find((i) => i.id === id);
      if (!item) throw notFound('Mensaje');
      const data = extractRequestDraft(item.payload.text);
      const draft: Draft = { id: randomId(), inbox_id: id, data, created_at: now() };
      s().drafts = [draft, ...s().drafts.filter((d) => d.inbox_id !== id)];
      item.status = 'extracted';
      extras.persist();
      return { id: draft.id, data };
    },

    // ---- chat ---------------------------------------------------------------------------
    listConversations: async (): Promise<ConversationSummary[]> =>
      [...s().conversations]
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
        .map((c) => {
          const last = (s().messages[c.id] ?? []).at(-1);
          return {
            id: c.id,
            peer: c.peer,
            displayName: c.displayName,
            orderId: c.orderId,
            supplierId: c.supplierId,
            agentPaused: c.agentPaused,
            autoReply: c.autoReply,
            lastMessageAt: c.lastMessageAt,
            preview: last?.body ?? null,
            unreadCount: c.unread,
          };
        }),
    createConversation: async (input: { phone: string; displayName?: string }) => {
      const digits = input.phone.replace(/\D/g, '');
      if (digits.length < 8) throw bad('Escribe un número de teléfono válido, con código de país.');
      const peer = `${digits}@s.whatsapp.net`;
      let conv = s().conversations.find((c) => c.peer === peer);
      if (!conv) {
        conv = { id: randomId(), peer, displayName: input.displayName ?? null, orderId: null, supplierId: null, agentPaused: false, autoReply: false, lastMessageAt: now(), createdAt: now(), unread: 0 };
        s().conversations.push(conv);
        s().messages[conv.id] = [];
        extras.persist();
      }
      return { id: conv.id, peer: conv.peer, displayName: conv.displayName };
    },
    getConversation: async (id: string): Promise<ChatMessage[]> => {
      const conv = conversationOf(id);
      if (conv.unread) {
        conv.unread = 0;
        extras.persist();
      }
      return clone(s().messages[id] ?? []);
    },
    sendChatMessage: async (id: string, input: SendChatMessageInput, _key?: string): Promise<SentChatMessage> => {
      conversationOf(id);
      const body = (input.body ?? '').trim();
      if (!body && !input.media) throw bad('Escribe un mensaje.');
      const message: ChatMessage = { id: randomId(), direction: 'out', body, at: now(), status: 'queued', simulated: true, media: input.media ?? null, promotion: input.promotion };
      pushMessage(id, message);
      extras.persist();
      return { id: message.id, conversationId: id, body, status: 'queued', createdAt: message.at };
    },
    linkConversation: async (id: string, input: LinkConversationInput): Promise<ConversationLinkResult> => {
      const conv = conversationOf(id);
      if ('orderId' in input) conv.orderId = input.orderId ?? null;
      if ('supplierId' in input) conv.supplierId = input.supplierId ?? null;
      extras.persist();
      return { id, orderId: conv.orderId, supplierId: conv.supplierId };
    },
    setConversationAgent: async (id: string, input: SetConversationAgentInput): Promise<ConversationAgentResult> => {
      const conv = conversationOf(id);
      conv.agentPaused = input.paused;
      if (input.autoReply !== undefined) conv.autoReply = input.autoReply;
      extras.persist();
      return { id, agentPaused: conv.agentPaused, autoReply: conv.autoReply };
    },
    simulateInbound: async (input: SimulateInboundInput): Promise<SimulateInboundResult> => {
      let conv = s().conversations.find((c) => c.peer === input.peer);
      if (!conv) {
        conv = { id: randomId(), peer: input.peer, displayName: null, orderId: null, supplierId: null, agentPaused: false, autoReply: false, lastMessageAt: now(), createdAt: now(), unread: 0 };
        s().conversations.push(conv);
        s().messages[conv.id] = [];
      }
      pushMessage(conv.id, { id: randomId(), direction: 'in', body: input.text, at: now(), simulated: true });
      conv.unread += 1;
      s().inbox.unshift({
        id: randomId(),
        payload: { dedupeKey: randomHex(32), messageId: `sim-${randomHex(4)}`, sessionId: 1, sender: input.peer, text: input.text },
        status: 'pending',
        created_at: now(),
      });
      extras.persist();
      return { received: true, duplicate: false, conversationId: conv.id };
    },

    // ---- agents (rules engine; every output is a proposal a person approves) --------------
    startAgentRun: async (input: StartAgentRunInput, _key?: string): Promise<AgentRun> => {
      if (input.kind === 'extract') {
        const item = s().inbox.find((i) => i.id === input.inboxId);
        if (!item) throw notFound('Mensaje');
        const draft = extractRequestDraft(item.payload.text);
        const steps = [
          { type: 'plan' as const, name: null, input: { text: item.payload.text }, output: { plan: 'Leer producto, cantidad y fecha con reglas locales.' } },
          { type: 'tool_call' as const, name: 'extraer_pedido', input: { text: item.payload.text }, output: null },
          { type: 'tool_result' as const, name: 'extraer_pedido', input: null, output: draft },
        ];
        const ok = draft.quantity !== null && draft.product !== null;
        const run = addRun({ ...base, kind: 'extract', status: ok ? 'succeeded' : 'failed', inboxId: item.id, input, stepsUsed: steps.length, error: ok ? null : 'Faltan datos para armar un borrador de pedido.' }, [
          ...steps,
          { type: ok ? 'final' : 'error', name: null, input: null, output: ok ? { proposal: 'order_draft' } : { missing: draft.missingFields } },
        ]);
        if (ok) {
          addProposal(
            run.id,
            'order_draft',
            {
              title: `${draft.quantity} ${draft.product}`.slice(0, 200),
              specification: (draft.specifications ?? item.payload.text).slice(0, 4000),
              quantity: draft.quantity,
              dueAt: draft.deadline ?? new Date(Date.now() + 21 * DAY).toISOString(),
              ownQuantity: 0,
              ownCostCents: 0,
              currency: 'PEN',
            },
            `Un cliente pidió ${draft.quantity} ${draft.product}${draft.deadline ? ' con fecha de entrega' : ''}. Revisa los datos antes de crear el pedido.`,
            { conversationId: s().conversations.find((c) => c.peer === item.payload.sender)?.id ?? null },
          );
        }
        extras.persist();
        return clone(run);
      }

      const conv = conversationOf(input.conversationId);
      if (input.kind === 'validate') {
        const order = await orders.getOrder(input.orderId);
        const lastIn = [...(s().messages[conv.id] ?? [])].reverse().find((m) => m.direction === 'in');
        const quote = extractPriceQuote(lastIn?.body ?? '');
        const ok = Boolean(conv.supplierId) && quote.quantity !== null && quote.unitCostCents !== null;
        const reason = !conv.supplierId ? 'Vincula la conversación a un proveedor para proponer su aporte.' : 'No encontré cantidad y precio en el último mensaje del proveedor.';
        const run = addRun({ ...base, kind: 'validate', status: ok ? 'succeeded' : 'failed', orderId: order.id, conversationId: conv.id, input, stepsUsed: 3, error: ok ? null : reason }, [
          { type: 'plan', name: null, input: null, output: { plan: 'Leer cantidad y precio del último mensaje del proveedor.' } },
          { type: 'tool_result', name: 'leer_precio', input: { text: lastIn?.body ?? '' }, output: quote },
          { type: ok ? 'final' : 'error', name: null, input: null, output: ok ? { proposal: 'contribution' } : { reason } },
        ]);
        if (ok) {
          addProposal(
            run.id,
            'contribution',
            {
              supplierId: conv.supplierId,
              specification: order.specification,
              quantity: quote.quantity,
              unitCostCents: quote.unitCostCents,
              availableAt: new Date(new Date(order.dueAt).getTime() - 3 * DAY).toISOString(),
              validUntil: new Date(Date.now() + 14 * DAY).toISOString(),
              confirmed: false,
            },
            'El proveedor ofreció esta cantidad y precio. Al aprobar queda registrado como aporte por confirmar.',
            { orderId: order.id, conversationId: conv.id },
          );
        }
        extras.persist();
        return clone(run);
      }

      // compose
      const order = input.orderId ? await orders.getOrder(input.orderId) : null;
      const supplier = (await orders.listSuppliers()).find((x) => x.id === conv.supplierId);
      const body = composeSupplierQuestion({ supplierName: supplier?.name ?? conv.displayName ?? 'equipo', orderTitle: order?.title ?? 'el pedido', quantity: order?.quantity });
      const run = addRun({ ...base, kind: 'compose', status: 'succeeded', orderId: order?.id ?? null, conversationId: conv.id, input, stepsUsed: 2 }, [
        { type: 'plan', name: null, input: null, output: { plan: 'Redactar una consulta clara de cantidad, precio y fecha.' } },
        { type: 'final', name: null, input: null, output: { proposal: 'message' } },
      ]);
      addProposal(run.id, 'message', { conversationId: conv.id, body }, 'Mensaje propuesto. No se envía hasta que lo apruebes.', { orderId: order?.id ?? null, conversationId: conv.id });
      extras.persist();
      return clone(run);
    },
    listAgentRuns: async (): Promise<AgentRun[]> => clone(s().runs),
    getAgentRun: async (id: string): Promise<AgentRunDetail> => {
      const run = s().runs.find((r) => r.id === id);
      if (!run) throw notFound('Ejecución');
      return clone({ ...run, steps: s().steps[id] ?? [] });
    },
    listProposals: async (status?: ProposalStatus): Promise<AgentProposal[]> =>
      clone(s().proposals.filter((p) => !status || p.status === status)),
    decideProposal: async (id: string, input: DecideProposalInput, _key?: string): Promise<AgentProposal> => {
      const proposal = s().proposals.find((p) => p.id === id);
      if (!proposal) throw notFound('Propuesta');
      if (proposal.status !== 'pending') throw bad('Esta propuesta ya fue resuelta.');
      proposal.decidedBy = 'tú';
      proposal.decidedAt = now();
      if (input.decision === 'reject') {
        proposal.status = 'rejected';
      } else {
        try {
          await apply(proposal);
          proposal.status = 'applied';
        } catch (error) {
          proposal.status = 'failed';
          proposal.error = error instanceof Error ? error.message : 'No se pudo aplicar la propuesta.';
        }
      }
      extras.persist();
      return clone(proposal);
    },
  };

  async function apply(proposal: AgentProposal): Promise<void> {
    const payload = proposal.payload as Record<string, never>;
    if (proposal.kind === 'order_draft') {
      await orders.createOrder(payload as never);
    } else if (proposal.kind === 'contribution') {
      if (!proposal.orderId) throw new Error('La propuesta no tiene un pedido asociado.');
      await orders.addContribution(proposal.orderId, payload as never);
    } else if (proposal.kind === 'message') {
      const { conversationId, body } = payload as unknown as { conversationId: string; body: string };
      pushMessage(conversationId, { id: randomId(), direction: 'out', body, at: now(), status: 'queued', simulated: true });
    } else {
      throw new Error('Este tipo de propuesta no se puede aplicar desde aquí.');
    }
  }
}
