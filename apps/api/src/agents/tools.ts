import { z } from 'zod';
import type { Pool } from 'pg';
import { feasibility, type Order } from '../domain.js';

/**
 * SAFETY INVARIANT: every tool in this file is read-only. None of them writes
 * to any table, ever. Adding a mutating tool here would defeat the whole
 * architecture — see docs/agent-architecture.md, "the one rule that shapes
 * everything". If you find yourself wanting a tool that writes, it should be
 * an agent_proposals row instead, produced by the runtime after the model's
 * final answer, and applied only through the human approval gate.
 *
 * SAFETY INVARIANT: no tool accepts an org id as model input. The org is
 * always bound server-side from the run row and passed in via ToolContext.
 * A tool schema must never contain a field like `orgId` — that would let a
 * model (or an attacker steering a model through message content) read
 * another tenant's data.
 */

const money = z.number().int().min(0).max(1_000_000_000);

export type ToolContext = { db: Pool; org: string };

export interface ToolDef<I = unknown, O = unknown> {
  name: string;
  /** One-line English description shown to the model. */
  description: string;
  schema: z.ZodType<I>;
  execute: (ctx: ToolContext, input: I) => Promise<O>;
}

function defineTool<I, O>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}

const getOrder = defineTool({
  name: 'get_order',
  description: 'Fetch an order by id, scoped to the current organization. Returns found:false if it does not exist or belongs to another org.',
  schema: z.object({ orderId: z.uuid() }).strict(),
  async execute({ db, org }, { orderId }) {
    const r = await db.query('SELECT data FROM orders WHERE id=$1 AND org_id=$2', [orderId, org]);
    if (!r.rowCount) return { found: false as const };
    return { found: true as const, order: r.rows[0]!.data as Order };
  },
});

const getFeasibility = defineTool({
  name: 'get_feasibility',
  description: 'Compute the deterministic feasibility check for an order: whether contributions cover the requested quantity on time, and the exact reasons it is blocked if not.',
  schema: z.object({ orderId: z.uuid() }).strict(),
  async execute({ db, org }, { orderId }) {
    const r = await db.query('SELECT data FROM orders WHERE id=$1 AND org_id=$2', [orderId, org]);
    if (!r.rowCount) return { found: false as const };
    const order = r.rows[0]!.data as Order;
    return { found: true as const, feasibility: feasibility(order) };
  },
});

const listSuppliers = defineTool({
  name: 'list_suppliers',
  description: 'List suppliers known to the current organization: id and name only.',
  schema: z.object({}).strict(),
  async execute({ db, org }) {
    const r = await db.query('SELECT id,name FROM suppliers WHERE org_id=$1 ORDER BY name', [org]);
    return { suppliers: r.rows as { id: string; name: string }[] };
  },
});

const getConversation = defineTool({
  name: 'get_conversation',
  description: 'Fetch the most recent messages (inbound and outbound, up to 30) of a conversation, scoped to the current organization.',
  schema: z.object({ conversationId: z.uuid() }).strict(),
  async execute({ db, org }, { conversationId }) {
    const owner = await db.query('SELECT id FROM conversations WHERE id=$1 AND org_id=$2', [conversationId, org]);
    if (!owner.rowCount) return { found: false as const };
    // Inbound messages live in `inbox` (payload.text), outbound ones in `outbound_messages` (body).
    // Merge both, newest first for the LIMIT, then present oldest-first for a readable transcript.
    const r = await db.query(
      `SELECT direction, body, delivery_status, created_at FROM (
         SELECT 'inbound' AS direction, payload->>'text' AS body, 'received' AS delivery_status, created_at FROM inbox WHERE conversation_id=$1 AND org_id=$2
         UNION ALL
         SELECT 'outbound' AS direction, body, CASE WHEN provider_message_id LIKE 'sim-%' THEN 'simulated' ELSE status END AS delivery_status, created_at FROM outbound_messages WHERE conversation_id=$1 AND org_id=$2
       ) merged ORDER BY created_at DESC LIMIT 30`,
      [conversationId, org],
    );
    const messages = (r.rows as { direction: 'inbound' | 'outbound'; body: string | null; delivery_status: string; created_at: Date }[]).reverse();
    return { found: true as const, messages };
  },
});

const computeQuotePreview = defineTool({
  name: 'compute_quote_preview',
  description: 'Pure arithmetic preview of a quote: given price/logistics/coordination cents, returns total cost and contribution over the order\'s current feasibility cost. Persists nothing.',
  schema: z.object({ orderId: z.uuid(), priceCents: money, logisticsCents: money, coordinationCents: money }).strict(),
  async execute({ db, org }, input) {
    const r = await db.query('SELECT data FROM orders WHERE id=$1 AND org_id=$2', [input.orderId, org]);
    if (!r.rowCount) return { found: false as const };
    const order = r.rows[0]!.data as Order;
    const base = feasibility(order).costCents;
    const costCents = base + input.logisticsCents + input.coordinationCents;
    const contributionCents = input.priceCents - costCents;
    return { found: true as const, costCents, contributionCents };
  },
});

/** Registry keyed by tool name. Every entry here is read-only — see the invariant above. */
export const TOOLS: Record<string, ToolDef<any, any>> = {
  [getOrder.name]: getOrder,
  [getFeasibility.name]: getFeasibility,
  [listSuppliers.name]: listSuppliers,
  [getConversation.name]: getConversation,
  [computeQuotePreview.name]: computeQuotePreview,
};

/** Tool definitions in the JSON-schema shape DeepSeek's chat-completions `tools` parameter expects. */
export const TOOL_DEFINITIONS_FOR_MODEL = Object.values(TOOLS).map(tool => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.schema),
  },
}));
