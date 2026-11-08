import { createHttpClient } from '@izumi/api-client';
import { clearToken, getToken } from '../../auth/tokenStorage';
export type SalesStatus = 'open' | 'quoted' | 'won' | 'lost';
export type Opportunity = { id: string; title: string; companyId: string | null; amountCents: number | null; currency: 'PEN'; status: SalesStatus; lossReason: string | null; createdAt: string; updatedAt: string };
const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017', getToken, onUnauthorized: () => { clearToken(); window.location.assign('/login'); } });
export const salesApi = {
  list: () => http.request<{ items: Opportunity[] }>('GET', '/opportunities'),
  create: (body: { title: string; amountCents: number | null; companyId?: string }) => http.request<Opportunity>('POST', '/opportunities', { body }),
  status: (id: string, body: { status: SalesStatus; lossReason?: string }) => http.request<Opportunity>('POST', `/opportunities/${encodeURIComponent(id)}/status`, { body }),
};
