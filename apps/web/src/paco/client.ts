/** Browser side of PACO: asks /api/paco and falls back to the same scripted guidance if it cannot be reached. */
import { scriptedAnswer } from './guidance';
import type { PacoContext } from './guidance';

export type PacoMessage = { role: 'user' | 'assistant'; content: string };
export type PacoReply = { text: string; source: 'paco' | 'guia'; degraded: boolean };

export async function askPaco(messages: PacoMessage[], context: PacoContext, endpoint = '/api/paco'): Promise<PacoReply> {
  const last = messages[messages.length - 1]?.content ?? '';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, context }),
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 429) {
      return { text: 'Estás preguntando muy rápido. Espera unos segundos y vuelve a intentarlo.', source: 'guia', degraded: true };
    }
    const body = (await response.json().catch(() => null)) as Partial<PacoReply> | null;
    if (response.ok && body?.text) return { text: body.text, source: body.source === 'paco' ? 'paco' : 'guia', degraded: Boolean(body.degraded) };
  } catch {
    // Offline or the function is not deployed: use the script below.
  }
  return { text: scriptedAnswer(last, context), source: 'guia', degraded: true };
}

export type PacoHealth = { available: boolean; provider: 'meta' | 'gateway' | 'guia'; reason: string };

/** Which provider PACO is using right now (Meta, AI Gateway or the scripted guide) and why. */
export async function pacoHealth(endpoint = '/api/paco'): Promise<PacoHealth> {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
    const body = (await response.json()) as Partial<PacoHealth>;
    if (response.ok) return { available: body.available === true, provider: body.provider ?? 'guia', reason: body.reason ?? '' };
  } catch {
    // fall through
  }
  return { available: false, provider: 'guia', reason: 'sin conexión con el servicio' };
}
