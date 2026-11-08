import { createHttpClient } from '@izumi/api-client';
import { clearToken, getToken } from '../../auth/tokenStorage';

export type CompanyInput = {
  name: string; country: string; city: string; role: 'buyer' | 'supplier' | 'both';
  products: string[]; hsCodes: string[]; sourceUrl: string;
  website?: string; contactUrl?: string; notes?: string;
};
export type Company = CompanyInput & {
  id: string; source: 'manual' | 'imported_scraping'; verification: 'unverified'; createdAt: string;
};
export type Connection = {
  id: string; companyId: string; purpose: 'supplier' | 'buyer'; status: 'pending'; createdAt: string;
};
export type DirectoryStatus = { scraping: { status: string }; tradeMap: { status: string } };
const http = createHttpClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017', getToken,
  onUnauthorized: () => { clearToken(); window.location.assign('/login'); },
});
export const directoryApi = {
  list: () => http.request<{ items: Company[] }>('GET', '/directory'),
  status: () => http.request<DirectoryStatus>('GET', '/directory/status'),
  connections: () => http.request<{ items: Connection[] }>('GET', '/directory/connections'),
  create: (body: CompanyInput) => http.request<Company>('POST', '/directory', { body }),
  import: (records: CompanyInput[]) => http.request<{ imported: number }>('POST', '/directory/import', { body: { authorized: true, records } }),
  connect: (id: string, purpose: 'supplier' | 'buyer', note: string) => http.request<Connection>('POST', `/directory/${encodeURIComponent(id)}/connect`, { body: { purpose, note } }),
};

/** Imported URLs are untrusted even when supplied by an authenticated business. */
export function safePublicUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
