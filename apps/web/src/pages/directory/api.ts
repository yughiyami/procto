import { extras } from '../../lib/apiClient';
import { randomId } from '../../store/hash';
import type { Company, CompanyInput, Connection } from '../../store/extras';

export type { Company, CompanyInput, Connection };
export type DirectoryStatus = { scraping: { status: string }; tradeMap: { status: string } };

const clone = <T,>(v: T): T => structuredClone(v);

function validate(input: CompanyInput): CompanyInput {
  const name = input.name?.trim();
  const country = input.country?.trim().toUpperCase();
  if (!name || name.length > 200) throw new Error('Escribe el nombre de la empresa.');
  if (!/^[A-Z]{2}$/.test(country ?? '')) throw new Error('El país va con dos letras, por ejemplo PE o CO.');
  if (!['buyer', 'supplier', 'both'].includes(input.role)) throw new Error('Elige si es comprador, proveedor o ambos.');
  if (!safePublicUrl(input.sourceUrl)) throw new Error('Indica la fuente pública (un enlace https) de donde sale este dato.');
  return { ...input, name, country: country!, city: (input.city ?? '').trim(), products: input.products ?? [], hsCodes: input.hsCodes ?? [] };
}

/** Local directory: companies you saved or imported, with their source. Nothing is sent anywhere. */
export const directoryApi = {
  list: async () => ({ items: clone(extras.state.companies) }),
  // Live Trade Map / TradeAtlas scraping needs credentials and is not connected.
  status: async (): Promise<DirectoryStatus> => ({ scraping: { status: 'not_configured' }, tradeMap: { status: 'not_configured' } }),
  connections: async () => ({ items: clone(extras.state.connections) }),
  create: async (body: CompanyInput): Promise<Company> => {
    const company: Company = { ...validate(body), id: randomId(), source: 'manual', verification: 'unverified', createdAt: new Date().toISOString() };
    extras.state.companies.unshift(company);
    extras.persist();
    return clone(company);
  },
  import: async (records: CompanyInput[]): Promise<{ imported: number }> => {
    const prepared = records.map((r, i) => {
      try {
        return validate(r);
      } catch (error) {
        throw new Error(`Registro ${i + 1}: ${error instanceof Error ? error.message : 'datos inválidos'}`);
      }
    });
    for (const input of prepared) {
      extras.state.companies.unshift({ ...input, id: randomId(), source: 'imported_scraping', verification: 'unverified', createdAt: new Date().toISOString() });
    }
    extras.persist();
    return { imported: prepared.length };
  },
  connect: async (id: string, purpose: 'supplier' | 'buyer', _note: string): Promise<Connection> => {
    if (!extras.state.companies.some((c) => c.id === id)) throw new Error('No encontramos esa empresa.');
    const connection: Connection = { id: randomId(), companyId: id, purpose, status: 'pending', createdAt: new Date().toISOString() };
    extras.state.connections.unshift(connection);
    extras.persist();
    return clone(connection);
  },
};

/** Imported URLs are untrusted even when supplied by the user. */
export function safePublicUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
