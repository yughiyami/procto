import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type WapiConfig = { baseUrl: string; apiKey: string; timeoutMs?: number };
export type InboundMessage = { dedupeKey: string; messageId: string; sessionId: number; sender: string; text: string };

/** Requires Wapi webhook_hmac=true. Never accepts the default plain-secret scheme. */
export function verifyWapiSignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

const inboundSchema = z.object({
  event: z.string(), sessionId: z.number().int().positive(),
  data: z.object({
    key: z.object({ id: z.string().min(1).max(256), remoteJid: z.string().min(1).max(256), fromMe: z.boolean().optional() }),
    message: z.object({ conversation: z.string().max(16000).optional(), extendedTextMessage: z.object({ text: z.string().max(16000) }).optional() }).optional(),
  }),
});

/** Text-only personal messages. Unknown/media/group events cannot trigger AI or commercial actions. */
export function normalizeWapiInbound(payload: unknown): InboundMessage | null {
  const parsed = inboundSchema.safeParse(payload);
  if (!parsed.success) return null;
  const p = parsed.data;
  if (!['messages.received', 'messages-personal.received'].includes(p.event) || p.data.key.fromMe) return null;
  const sender = p.data.key.remoteJid;
  if (!/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(sender)) return null;
  const text = p.data.message?.conversation ?? p.data.message?.extendedTextMessage?.text;
  if (!text?.trim()) return null;
  // Provider timestamp changes during retries. Message key, session and sender do not.
  const dedupeKey = createHash('sha256').update(JSON.stringify([p.sessionId, sender, p.data.key.id])).digest('hex');
  return { dedupeKey, messageId: p.data.key.id, sessionId: p.sessionId, sender, text };
}

export function serviceUrl(baseUrl: string, path: string): URL {
  const url = new URL(baseUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) throw new Error('Service URL must use HTTPS (HTTP allowed only on loopback)');
  return new URL(`${url.href.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);
}

export type OutboundMedia = { kind: 'image' | 'sticker'; url: string };
// Provider fetches the media. Reject local/private literals and credential-bearing URLs.
export const mediaSchema = z.object({ kind: z.enum(['image', 'sticker']), url: z.string().max(2048).url().refine(value => {
  const u = new URL(value); const h = u.hostname.toLowerCase();
  return u.protocol === 'https:' && !u.username && !u.password && !u.hash && h.includes('.') &&
    !h.endsWith('.local') && !h.endsWith('.localhost') && !h.endsWith('.internal') &&
    !/^[0-9.]+$/.test(h) && !h.includes(':');
}, 'Usa una URL HTTPS pública, sin credenciales') }).strict();

export async function sendWapiMessage(config: WapiConfig, input: { to: string; text?: string; media?: OutboundMedia }, fetchImpl: typeof fetch = fetch): Promise<{ status: 'accepted' | 'unknown'; providerMessageId?: string }> {
  const parsed = z.object({ to: z.string().regex(/^\+?\d{7,15}$|^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/), text: z.string().trim().max(4000).optional(), media: mediaSchema.optional() }).strict().refine(v => !!v.text || !!v.media).parse(input);
  if (!config.apiKey) throw new Error('WAPI_API_KEY missing');
  const payload = parsed.media?.kind === 'sticker' ? { to: parsed.to, stickerUrl: parsed.media.url } :
    { to: parsed.to, ...(parsed.text ? { text: parsed.text } : {}), ...(parsed.media ? { imageUrl: parsed.media.url } : {}) };
  try {
    const response = await fetchImpl(serviceUrl(config.baseUrl, 'api/send-message'), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs ?? 15000), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) return { status: 'unknown' };
    const data = z.object({ success: z.literal(true), data: z.object({ msgId: z.union([z.string().min(1), z.number().int()]) }) }).safeParse(await response.json());
    return data.success ? { status: 'accepted', providerMessageId: String(data.data.data.msgId) } : { status: 'unknown' };
  } catch { return { status: 'unknown' }; }
}

/** One attempt only. A successful dispatch acknowledges provider acceptance, NOT delivery.
 * Unknown outcomes require operator reconciliation, never blind resend. */
export async function sendWapiText(config: WapiConfig, input: { to: string; text: string }, fetchImpl: typeof fetch = fetch): Promise<{ status: 'accepted' | 'unknown'; providerMessageId?: string }> {
  z.object({ to: z.string().regex(/^\+?\d{7,15}$|^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/), text: z.string().trim().min(1).max(4000) }).parse(input);
  if (!config.apiKey) throw new Error('WAPI_API_KEY missing');
  const url = serviceUrl(config.baseUrl, 'api/send-message');
  try {
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs ?? 15000), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) return { status: 'unknown' };
    const data = z.object({ success: z.literal(true), data: z.object({ msgId: z.union([z.string().min(1), z.number().int()]) }) }).safeParse(await response.json());
    return data.success ? { status: 'accepted', providerMessageId: String(data.data.data.msgId) } : { status: 'unknown' };
  } catch { return { status: 'unknown' }; }
}
