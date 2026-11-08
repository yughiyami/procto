import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@izumi/api-client';
import { Alert, Badge, Button, Field, Input, Modal, PageHeader } from '@izumi/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { directoryApi } from '../directory/api';
import { salesApi, type Opportunity, type SalesStatus } from './api';
import './SalesPage.css';

const statuses: SalesStatus[] = ['open', 'quoted', 'won', 'lost'];
const labels = { open: 'Abiertas', quoted: 'Cotizadas', won: 'Ganadas declaradas', lost: 'Perdidas declaradas' };
const money = (cents: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);
const message = (error: unknown) => error instanceof ApiError ? error.userMessage() : 'No se pudo completar la operación.';
const key = ['sales-opportunities'];

export default function SalesPage() {
  useDocumentTitle('Ventas');
  const cache = useQueryClient();
  const list = useQuery({ queryKey: key, queryFn: salesApi.list });
  const companies = useQuery({ queryKey: ['directory', 'companies'], queryFn: directoryApi.list });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [status, setStatus] = useState<SalesStatus>('open');
  const [filter, setFilter] = useState('all');
  const [localError, setLocalError] = useState('');
  const items = list.data?.items ?? [];
  const refresh = () => cache.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: salesApi.create, onSuccess: async () => { await refresh(); setCreating(false); } });
  const update = useMutation({ mutationFn: (body: { status: SalesStatus; lossReason?: string }) => salesApi.status(selected!.id, body), onSuccess: async () => { await refresh(); setSelected(null); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError('');
    const form = new FormData(event.currentTarget);
    const amount = String(form.get('amount') ?? '').trim();
    if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) { setLocalError('Usa un monto positivo con hasta dos decimales.'); return; }
    const cents = amount ? Math.round(Number(amount) * 100) : null;
    if (cents !== null && !Number.isSafeInteger(cents)) { setLocalError('El monto excede el límite permitido.'); return; }
    const companyId = String(form.get('companyId') ?? '');
    create.mutate({ title: String(form.get('title') ?? ''), amountCents: cents, ...(companyId ? { companyId } : {}) });
  }
  const needsFollowup = (item: Opportunity) => ['open', 'quoted'].includes(item.status) && Date.now() - Date.parse(item.updatedAt) > 7 * 86400000;
  return <div className="sales-page"><PageHeader title="Ventas y oportunidades" subtitle="Distingue interés comercial, venta declarada y dinero cobrado." actions={<Button onClick={() => { create.reset(); setLocalError(''); setCreating(true); }}>Nueva oportunidad</Button>} />
    <Alert tone="info" title="Cifras declaradas, no cobros">Los estados los actualiza tu equipo. Ganada no significa cobrada; sin respuesta no significa perdida. No se envían mensajes automáticos.</Alert>
    {list.isPending && <p role="status">Cargando oportunidades…</p>}
    {list.isError && <Alert tone="danger" title="No se pudieron cargar las ventas"><Button onClick={() => void list.refetch()}>Reintentar</Button></Alert>}
    {list.isSuccess && <><div className="sales-page__metrics">{statuses.map(state => {
      const group = items.filter(item => item.status === state);
      const unknown = group.filter(item => item.amountCents === null).length;
      return <article key={state}><span>{labels[state]}</span><strong>{group.length}</strong><b>{money(group.reduce((sum, item) => sum + (item.amountCents ?? 0), 0))}</b><small>{unknown ? `${unknown} sin monto; no incluidos en el valor` : 'Suma de montos registrados'}</small></article>;
    })}</div><p>{items.filter(needsFollowup).length} oportunidades requieren seguimiento: más de 7 días sin cambio de estado. No se clasifican como pérdidas.</p>
    <Field label="Filtrar oportunidades" htmlFor="sales-filter"><select id="sales-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los estados</option>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></Field>
    <section className="sales-page__list" aria-label="Oportunidades">{items.filter(item => filter === 'all' || item.status === filter).map(item => <article key={item.id}><div><h2>{item.title}</h2><Badge tone={item.status === 'lost' ? 'danger' : item.status === 'won' ? 'success' : 'neutral'}>{labels[item.status]}</Badge>{needsFollowup(item) && <Badge tone="warning">Revisar seguimiento</Badge>}<p>{item.amountCents === null ? 'Monto por definir' : money(item.amountCents)}</p>{item.companyId && <p>Empresa: {companies.data?.items.find(company => company.id === item.companyId)?.name ?? 'Referencia del directorio'}</p>}{item.lossReason && <p>Motivo: {item.lossReason}</p>}<small>Actualizada: {new Date(item.updatedAt).toLocaleDateString('es-PE')}</small></div><Button variant="secondary" onClick={() => { update.reset(); setStatus(item.status); setSelected(item); }}>Actualizar estado</Button></article>)}{!items.filter(item => filter === 'all' || item.status === filter).length && <p>No hay oportunidades en esta vista. Registra una conversación comercial real para empezar.</p>}</section></>}
    <Modal open={creating} onClose={() => setCreating(false)} title="Nueva oportunidad"><form className="sales-page__form" onSubmit={submit}>{(create.isError || localError) && <Alert tone="danger" title="Revisa los datos">{localError || message(create.error)}</Alert>}<Field label="¿Qué te quieren comprar?" htmlFor="sale-title" required><Input id="sale-title" name="title" required maxLength={200} /></Field><Field label="Monto estimado en soles (opcional)" htmlFor="sale-amount"><Input id="sale-amount" name="amount" inputMode="decimal" placeholder="1500.00" /></Field><Field label="Empresa del directorio (opcional)" htmlFor="sale-company"><select id="sale-company" name="companyId"><option value="">Sin empresa vinculada</option>{companies.data?.items.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>{companies.isError && <small>No se pudo cargar el directorio. Puedes guardar sin vincular una empresa.</small>}<Button type="submit" loading={create.isPending}>Guardar oportunidad</Button></form></Modal>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Actualizar oportunidad"><form className="sales-page__form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); update.mutate({ status, ...(status === 'lost' ? { lossReason: String(data.get('lossReason') ?? '') } : {}) }); }}>{update.isError && <Alert tone="danger" title="No se pudo actualizar">{message(update.error)}</Alert>}<Field label="Estado declarado" htmlFor="sale-status"><select id="sale-status" value={status} onChange={event => setStatus(event.target.value as SalesStatus)}>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></Field>{status === 'lost' && <Field label="Motivo de pérdida" htmlFor="sale-reason" required><Input id="sale-reason" name="lossReason" required maxLength={2000} defaultValue={selected?.lossReason ?? ''} /></Field>}{status === 'won' && <p>Confirmas una venta comercial. El cobro debe registrarse por separado en Caja.</p>}<Button type="submit" loading={update.isPending}>Confirmar estado</Button></form></Modal>
  </div>;
}
