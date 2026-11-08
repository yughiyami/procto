import { z } from 'zod';

/**
 * Mirrors the `conversations` and `outbound_messages` tables in apps/api/src/db.ts, plus the
 * request bodies the chat surface sends. See docs/agent-architecture.md "WhatsApp conversations".
 */

/** The WhatsApp JID pattern apps/api/src/integrations/wapi.ts accepts for a sender/peer. */
const JID_PATTERN = /^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/;

export type Conversation = {
  id: string;
  orgId: string;
  peer: string;
  displayName: string | null;
  orderId: string | null;
  supplierId: string | null;
  agentPaused: boolean;
  autoReply?: boolean;
  lastMessageAt: string;
  createdAt: string;
};

export type OutboundStatus = 'queued' | 'accepted' | 'sent' | 'unknown' | 'failed';

export type OutboundMessage = {
  id: string;
  orgId: string;
  conversationId: string;
  body: string;
  status: OutboundStatus;
  providerMessageId: string | null;
  approvedBy: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

/** Unified view item for the chat UI: one shape for both inbound and outbound messages. */
export type ChatMessage = {
  id: string;
  direction: 'in' | 'out';
  body: string;
  at: string;
  status?: OutboundStatus;
  simulated: boolean;
  media?: { kind: 'image' | 'sticker'; url: string } | null;
  promotion?: boolean;
};

/**
 * `sendWapiText` never blind-retries (see wapi.ts), so 'unknown' must read as neither success nor
 * failure â€” it is an operator reconciliation task, not a pending retry.
 */
export const OUTBOUND_STATUS_LABELS: Record<OutboundStatus, string> = {
  queued: 'En cola',
  accepted: 'Aceptado por Wapi — entrega no verificada',
  sent: 'Envío registrado — entrega no verificada',
  unknown: 'Resultado no confirmado â€” verificar manualmente',
  failed: 'FallÃ³ el envÃ­o',
};

export const sendMessageSchema = z
  .object({
    conversationId: z.uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export const linkConversationSchema = z
  .object({
    orderId: z.uuid().nullable(),
    supplierId: z.uuid().nullable(),
  })
  .strict();

export const simulateInboundSchema = z
  .object({
    peer: z.string().regex(JID_PATTERN),
    text: z.string().trim().min(1).max(16000),
  })
  .strict();
