import { extras } from '../../lib/apiClient';
import { randomId } from '../../store/hash';
import type { Opportunity, SalesStatus } from '../../store/extras';

export type { Opportunity, SalesStatus };

const clone = <T,>(v: T): T => structuredClone(v);

/** Local sales pipeline: declared opportunities, never confirmed revenue. */
export const salesApi = {
  list: async () => ({ items: clone(extras.state.opportunities) }),
  create: async (body: { title: string; amountCents: number | null; companyId?: string }): Promise<Opportunity> => {
    const title = body.title.trim();
    if (!title) throw new Error('Escribe un título para la oportunidad.');
    const now = new Date().toISOString();
    const item: Opportunity = { id: randomId(), title, companyId: body.companyId ?? null, amountCents: body.amountCents, currency: 'PEN', status: 'open', lossReason: null, createdAt: now, updatedAt: now };
    extras.state.opportunities.unshift(item);
    extras.persist();
    return clone(item);
  },
  status: async (id: string, body: { status: SalesStatus; lossReason?: string }): Promise<Opportunity> => {
    const item = extras.state.opportunities.find((o) => o.id === id);
    if (!item) throw new Error('No encontramos esa oportunidad.');
    if (body.status === 'lost' && !body.lossReason?.trim()) throw new Error('Indica el motivo de la pérdida.');
    item.status = body.status;
    item.lossReason = body.status === 'lost' ? (body.lossReason ?? '').trim() : null;
    item.updatedAt = new Date().toISOString();
    extras.persist();
    return clone(item);
  },
};
