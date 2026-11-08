import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const pitchInput = z.object({
  agent: z.string().trim().min(1).max(80).default('PACO · Agente de compras'),
  recipient: z.string().regex(/^\+51\d{9}$/).default('+51953597691'),
}).strict();
export const pitchAcceptance = z.object({ response: z.string().trim().transform(v => v.toUpperCase()).pipe(z.literal('ACEPTAR')), demo: z.literal(true) }).strict();
export type PitchEvent = { index: number; stage: string; label: string; at: string; previousDigest: string | null; digest: string };
export type PitchRun = {
  id: string; mode: 'simulation'; chainStatus: 'not_anchored'; messageStatus: 'not_sent';
  agent: string; recipient: string; status: 'waiting_acceptance' | 'completed'; createdAt: string;
  product: string; quantity: number; unitPriceCents: number; totalCents: number; currency: 'PEN';
  events: PitchEvent[]; order: { id: string; status: 'fulfilled_simulated' } | null;
  escrow: { amountCents: number; status: 'released_simulated' } | null;
  receipt: { id: string; issuedAt: string; legalValidity: false; amountCents: number } | null;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function append(run: PitchRun, stage: string, label: string, at: string) {
  const entry = { index: run.events.length + 1, stage, label, at, previousDigest: run.events.at(-1)?.digest ?? null };
  run.events.push({ ...entry, digest: digest({ runId: run.id, ...entry }) });
}
export function createPitchRun(input: unknown, at = new Date().toISOString()): PitchRun {
  const data = pitchInput.parse(input);
  const run: PitchRun = { id: randomUUID(), mode: 'simulation', chainStatus: 'not_anchored', messageStatus: 'not_sent', ...data,
    status: 'waiting_acceptance', createdAt: at, product: 'Polos de algodón · lote demostrativo', quantity: 100,
    unitPriceCents: 1800, totalCents: 180000, currency: 'PEN', events: [], order: null, escrow: null, receipt: null };
  append(run, 'proposal', 'Propuesta preparada · no enviada a WhatsApp', at);
  return run;
}
/** Deterministic demo effects only. No provider, wallet, jobs or live order dependencies. */
export function acceptPitchRun(original: PitchRun, input: unknown, at = new Date().toISOString()): PitchRun {
  pitchAcceptance.parse(input);
  if (original.status === 'completed') return original;
  const run: PitchRun = structuredClone(original);
  append(run, 'acceptance', 'ACEPTAR confirmado en interfaz DEMO', at);
  run.order = { id: `DEMO-${run.id}`, status: 'fulfilled_simulated' };
  append(run, 'order', 'Pedido DEMO creado · separado de pedidos comerciales', at);
  run.escrow = { amountCents: run.totalCents, status: 'released_simulated' };
  append(run, 'escrow', 'S/ 1,800.00 en custodia simulada · sin fondos', at);
  append(run, 'delivery', 'Entrega simulada · no acredita entrega física', at);
  append(run, 'release', 'Liberación simulada · sin transferencia', at);
  run.receipt = { id: `REC-DEMO-${run.id}`, issuedAt: at, legalValidity: false, amountCents: run.totalCents };
  append(run, 'receipt', 'Comprobante DEMO emitido · sin validez tributaria', at);
  run.status = 'completed';
  return run;
}
export function verifyPitchLedger(run: PitchRun): boolean {
  return run.events.every((event, i) => {
    const { digest: actual, ...entry } = event;
    return entry.index === i + 1 && entry.previousDigest === (run.events[i - 1]?.digest ?? null)
      && actual === digest({ runId: run.id, index: entry.index, stage: entry.stage, label: entry.label, at: entry.at, previousDigest: entry.previousDigest });
  });
}
