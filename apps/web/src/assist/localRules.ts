/**
 * Offline, rule-based helpers that replace the old DeepSeek calls: they read a request, a price,
 * a money movement or a business description from plain Spanish and always return a draft that a
 * person confirms. Nothing here contacts a model or a third party. Pure and unit-tested.
 */
import type { MovementKind } from '@izumi/contracts';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const GARMENTS = /\b(polos?|poleras?|chompas?|chalecos?|ponchos?|gorros?|chullos?|bufandas?|guantes?|medias|calcetines|camisas?|uniformes?|casacas?|sacos?|mantas?|chalinas?|prendas|piezas|unidades)\b/i;

export type RequestDraft = {
  product: string | null;
  quantity: number | null;
  specifications: string | null;
  deadline: string | null;
  missingFields: string[];
  requiresHumanConfirmation: true;
};

function parseDeadline(text: string, now: Date): string | null {
  const dated = new RegExp(`(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})(?:\\s+de\\s+(\\d{4}))?`, 'i').exec(text);
  if (dated) {
    const day = Number(dated[1]);
    const month = MONTHS.indexOf(dated[2]!.toLowerCase());
    let year = dated[3] ? Number(dated[3]) : now.getUTCFullYear();
    let date = new Date(Date.UTC(year, month, day, 12));
    if (!dated[3] && date.getTime() < now.getTime()) {
      year += 1;
      date = new Date(Date.UTC(year, month, day, 12));
    }
    return date.toISOString();
  }
  const relative = /en\s+(\d{1,2})\s+(d[ií]as?|semanas?|mes(?:es)?)/i.exec(text);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2]!.toLowerCase();
    const days = unit.startsWith('d') ? n : unit.startsWith('s') ? n * 7 : n * 30;
    return new Date(now.getTime() + days * 86_400_000).toISOString();
  }
  return null;
}

export function extractRequestDraft(text: string, now: Date = new Date()): RequestDraft {
  const quantityMatch = /\b(\d{1,6})\s+(?:unidades\s+de\s+|piezas\s+de\s+)?([a-záéíóúñ]+(?:\s+(?:de|en)\s+[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)?)/i.exec(text);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : null;
  let product: string | null = null;
  if (quantityMatch && GARMENTS.test(quantityMatch[2]!)) product = quantityMatch[2]!.trim();
  else if (GARMENTS.test(text)) product = GARMENTS.exec(text)![0].toLowerCase();
  const sizes = /tallas?\s+([A-Za-z0-9,\s-]{1,40})/i.exec(text);
  const specifications = sizes ? `Tallas ${sizes[1]!.trim().replace(/\s+/g, ' ')}` : null;
  const deadline = parseDeadline(text, now);
  const missingFields: string[] = [];
  if (!product) missingFields.push('product');
  if (quantity === null) missingFields.push('quantity');
  if (!deadline) missingFields.push('deadline');
  return { product, quantity, specifications, deadline, missingFields, requiresHumanConfirmation: true };
}

const toNumber = (raw: string): number => Number(raw.replace(/\.(?=\d{3}\b)/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));

/** "150 unidades a S/ 9.50 cada una" -> { quantity: 150, unitCostCents: 950 } */
export function extractPriceQuote(text: string): { quantity: number | null; unitCostCents: number | null } {
  const price = /(?:s\/\.?\s*|a\s+)(\d+(?:[.,]\d{1,2})?)\s*(?:soles)?\s*(?:cada|la\s+unidad|c\/u|por\s+unidad|x\s*unidad)/i.exec(text);
  const priceLoose = price ?? /(?:s\/\.?\s*)(\d+(?:[.,]\d{1,2})?)/i.exec(text) ?? /(\d+(?:[.,]\d{1,2})?)\s*soles/i.exec(text);
  const qty = /(\d{1,6})\s*(?:unidades|piezas|prendas|chompas|polos|ponchos|gorros|und)/i.exec(text);
  return {
    quantity: qty ? Number(qty[1]) : null,
    unitCostCents: priceLoose ? Math.round(toNumber(priceLoose[1]!) * 100) : null,
  };
}

export type MovementDraft = {
  kind: MovementKind | null;
  amountCents: number | null;
  counterparty: string | null;
  note: string | null;
  missingFields: string[];
  requiresHumanConfirmation: true;
};

export function extractMovementDraft(text: string): MovementDraft {
  const lower = text.toLowerCase();
  let kind: MovementKind | null = null;
  if (/(cobr[ée]|me pag|recib[ií]|adelanto del cliente)/.test(lower)) kind = 'customer_receipt';
  else if (/(devolv[ií]|reembols)/.test(lower)) kind = 'customer_refund';
  else if (/(pagu[ée]|pago a|pagamos)/.test(lower) && /(taller|proveedor|bordado|tejido)/.test(lower)) kind = 'supplier_payment';
  else if (/(pagu[ée]|gast[ée]|compr[ée]|flete|transporte)/.test(lower)) kind = 'other_cost';
  const amount = /(?:s\/\.?\s*)(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*soles/i.exec(text);
  const raw = amount?.[1] ?? amount?.[2];
  const amountCents = raw ? Math.round(toNumber(raw) * 100) : null;
  const who = /(?:al|a la|a)\s+((?:cliente|taller|proveedor)[a-záéíóúñ\s]*?)(?:\s+por\b|$|\.)/i.exec(text);
  const note = /por\s+(?:el|la)?\s*(.+)$/i.exec(text);
  const missingFields: string[] = [];
  if (!kind) missingFields.push('kind');
  if (amountCents === null || !Number.isFinite(amountCents)) missingFields.push('amountCents');
  return {
    kind,
    amountCents: amountCents !== null && Number.isFinite(amountCents) ? amountCents : null,
    counterparty: who ? who[1]!.trim() : null,
    note: note ? note[1]!.trim() : null,
    missingFields,
    requiresHumanConfirmation: true,
  };
}

export type ProfileDraft = {
  name: string | null;
  city: string | null;
  activity: 'seller' | 'coordinator' | 'both' | null;
  products: string[] | null;
  missingFields: string[];
  requiresHumanConfirmation: true;
};

export function suggestProfile(text: string): ProfileDraft {
  const name = /(?:se llama|mi negocio es|mi empresa es|somos)\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]*(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]*){0,4})/.exec(text);
  const city = /(?:estoy en|ubicad[oa] en|desde|en la ciudad de|en)\s+(Arequipa|Lima|Cusco|Puno|Trujillo|Juliaca|Huancayo|Ayacucho|Piura|Chiclayo|Tacna|Ica|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/.exec(text);
  const sells = /\b(vendo|vendemos|producimos|fabrico|fabricamos|hago|hacemos)\b/i.test(text);
  const coordinates = /\b(coordino|coordinamos|red de|talleres)\b/i.test(text);
  const activity = sells && coordinates ? 'both' : coordinates ? 'coordinator' : sells ? 'seller' : null;
  const productsMatch = /(?:vendo|vendemos|producimos|fabrico|fabricamos)\s+([^.]+?)(?:\s+y\s+(?:coordino|coordinamos)|\.|$)/i.exec(text);
  const products = productsMatch
    ? productsMatch[1]!
        .split(/,|\s+y\s+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : null;
  const missingFields: string[] = [];
  if (!name) missingFields.push('name');
  if (!city) missingFields.push('city');
  if (!activity) missingFields.push('activity');
  if (!products || products.length === 0) missingFields.push('products');
  return {
    name: name ? name[1]!.trim() : null,
    city: city ? city[1]! : null,
    activity,
    products: products && products.length ? products : null,
    missingFields,
    requiresHumanConfirmation: true,
  };
}

export function composeSupplierQuestion(input: { supplierName: string; orderTitle: string; quantity?: number }): string {
  const qty = input.quantity ? ` (${input.quantity} unidades en total)` : '';
  return `Hola ${input.supplierName}, te escribo por el pedido "${input.orderTitle}"${qty}. ¿Puedes confirmarme cuántas unidades alcanzas a hacer, a qué precio por unidad y para qué fecha? Con eso armo la cotización. Gracias.`;
}
