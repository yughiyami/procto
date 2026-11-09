/**
 * Browser store for the sections that used to live behind the Fastify/Postgres API: chat, inbox,
 * proposals, directory, sales and RFQs. Everything is local (localStorage). Seed records are
 * flagged as examples so nobody mistakes them for real contacts.
 */
import type { AgentProposal, AgentRun, AgentStep, ChatMessage, Draft, InboxItem } from '@izumi/contracts';
import { randomHex, randomId } from './hash';
import type { StorageLike } from './localStore';

export type CompanyInput = {
  name: string;
  country: string;
  city: string;
  role: 'buyer' | 'supplier' | 'both';
  products: string[];
  hsCodes: string[];
  sourceUrl: string;
  website?: string;
  contactUrl?: string;
  notes?: string;
};
export type Company = CompanyInput & {
  id: string;
  source: 'manual' | 'imported_scraping' | 'sample';
  verification: 'unverified';
  createdAt: string;
};
export type Connection = { id: string; companyId: string; purpose: 'supplier' | 'buyer'; status: 'pending'; createdAt: string };

export type SalesStatus = 'open' | 'quoted' | 'won' | 'lost';
export type Opportunity = {
  id: string;
  title: string;
  companyId: string | null;
  amountCents: number | null;
  currency: 'PEN';
  status: SalesStatus;
  lossReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A request for quotation published in the repository (sample data until a real network feeds it). */
export type Rfq = {
  id: string;
  title: string;
  buyer: string;
  country: string;
  quantity: number;
  unit: string;
  hsCode: string;
  deadline: string;
  notes: string;
  source: 'sample';
  respondedOpportunityId: string | null;
};

export type StoredConversation = {
  id: string;
  peer: string;
  displayName: string | null;
  orderId: string | null;
  supplierId: string | null;
  agentPaused: boolean;
  autoReply: boolean;
  lastMessageAt: string;
  createdAt: string;
  unread: number;
};

export type ExtrasState = {
  version: 1;
  conversations: StoredConversation[];
  messages: Record<string, ChatMessage[]>;
  inbox: InboxItem[];
  drafts: Draft[];
  runs: AgentRun[];
  steps: Record<string, AgentStep[]>;
  proposals: AgentProposal[];
  companies: Company[];
  connections: Connection[];
  opportunities: Opportunity[];
  rfqs: Rfq[];
};

const KEY = 'procto.extras.v1';
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86_400_000;

const company = (name: string, country: string, city: string, role: Company['role'], products: string[], hsCodes: string[], notes: string, source: Company['source'] = 'sample', sourceUrl = 'https://example.org/ejemplo'): Company => ({
  id: randomId(),
  name,
  country,
  city,
  role,
  products,
  hsCodes,
  sourceUrl,
  notes,
  source,
  verification: 'unverified',
  createdAt: iso(),
});

const EXAMPLE_NOTE = 'EJEMPLO: dato de muestra para probar el directorio. No es una empresa real ni un contacto.';

export function buildExtrasSeed(): ExtrasState {
  const jid = '51987654321@s.whatsapp.net';
  const conv: StoredConversation = {
    id: randomId(),
    peer: jid,
    displayName: 'Tienda Miraflores (ejemplo)',
    orderId: null,
    supplierId: null,
    agentPaused: false,
    autoReply: false,
    lastMessageAt: iso(-2 * 3_600_000),
    createdAt: iso(-DAY),
    unread: 1,
  };
  const requestText = 'Hola, necesito 200 polos de algodón pima para el 20 de diciembre, tallas S M L. ¿Me pueden cotizar?';
  const inbox: InboxItem[] = [
    {
      id: randomId(),
      payload: { dedupeKey: randomHex(32), messageId: 'EJEMPLO-1', sessionId: 1, sender: jid, text: requestText },
      status: 'received',
      created_at: iso(-2 * 3_600_000),
    },
  ];
  return {
    version: 1,
    conversations: [conv],
    messages: {
      [conv.id]: [
        { id: randomId(), direction: 'in', body: requestText, at: iso(-2 * 3_600_000), simulated: true },
        { id: randomId(), direction: 'out', body: 'Hola, recibimos tu pedido. Te respondemos con la cotización hoy.', at: iso(-110 * 60_000), status: 'queued', simulated: true },
      ],
    },
    inbox,
    drafts: [],
    runs: [],
    steps: {},
    proposals: [],
    companies: [
      company('Incalpaca', 'PE', '', 'supplier', ['accesorios', 'tejido de punto', 'telas'], [], 'Empresa real hallada en su página oficial. Registro curado a mano, no es extracción automática. Identidad, capacidad y disponibilidad sin verificar.', 'manual', 'https://www.incalpaca.com/es/pages/about'),
      company('Texdia', 'PT', '', 'supplier', ['prendas de punto'], [], 'Empresa real hallada en su página oficial. Registro curado a mano, no es extracción automática. Identidad, capacidad y disponibilidad sin verificar.', 'manual', 'https://texdia.pt/'),
      company('Boutique Andina Madrid (ejemplo)', 'ES', 'Madrid', 'buyer', ['chompas de alpaca', 'ponchos'], ['6110'], EXAMPLE_NOTE),
      company('Outdoor Nordic Shop (ejemplo)', 'SE', 'Gotemburgo', 'buyer', ['gorros', 'guantes de lana'], ['6505', '6116'], EXAMPLE_NOTE),
      company('Hilandería Sur (ejemplo)', 'PE', 'Arequipa', 'supplier', ['hilo de alpaca', 'hilo de lana'], ['5107'], EXAMPLE_NOTE),
      company('Bordados Cusco Artesanal (ejemplo)', 'PE', 'Cusco', 'supplier', ['bordado a mano', 'aplicaciones'], ['5810'], EXAMPLE_NOTE),
      company('Tienda Regalos Bogotá (ejemplo)', 'CO', 'Bogotá', 'buyer', ['mantas', 'chalinas'], ['6214'], EXAMPLE_NOTE),
      company('Textiles del Norte (ejemplo)', 'EC', 'Cuenca', 'both', ['polos', 'uniformes'], ['6109'], EXAMPLE_NOTE),
    ],
    connections: [],
    opportunities: [],
    rfqs: [
      { id: randomId(), title: 'Chompas de alpaca baby, colores neutros', buyer: 'Boutique Andina Madrid (ejemplo)', country: 'ES', quantity: 400, unit: 'unidades', hsCode: '6110', deadline: iso(35 * DAY), notes: 'EJEMPLO. Pide muestra física y entrega consolidada.', source: 'sample', respondedOpportunityId: null },
      { id: randomId(), title: 'Gorros y guantes de lana para temporada de invierno', buyer: 'Outdoor Nordic Shop (ejemplo)', country: 'SE', quantity: 1200, unit: 'pares/piezas', hsCode: '6505', deadline: iso(60 * DAY), notes: 'EJEMPLO. Requiere etiquetado en inglés.', source: 'sample', respondedOpportunityId: null },
      { id: randomId(), title: 'Mantas tejidas con diseños andinos', buyer: 'Tienda Regalos Bogotá (ejemplo)', country: 'CO', quantity: 150, unit: 'unidades', hsCode: '6301', deadline: iso(25 * DAY), notes: 'EJEMPLO. Pago contra entrega.', source: 'sample', respondedOpportunityId: null },
    ],
  };
}

/** Persistence wrapper with the same fail-soft behaviour as the main store. */
export class ExtrasStore {
  state: ExtrasState;

  constructor(private readonly storage: StorageLike | null) {
    this.state = this.read() ?? buildExtrasSeed();
    if (!this.storage?.getItem(KEY)) this.persist();
  }

  private read(): ExtrasState | null {
    try {
      const text = this.storage?.getItem(KEY);
      if (!text) return null;
      const parsed = JSON.parse(text) as ExtrasState;
      return parsed.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  persist(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  }

  reset(): void {
    this.state = buildExtrasSeed();
    this.persist();
  }
}
