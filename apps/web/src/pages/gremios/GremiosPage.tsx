import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import { Alert, Badge, Button, Field, Input, PageHeader } from '@izumi/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiClient, extras, store } from '../../lib/apiClient';
import type { Gremio } from '../../store/extras';
import { randomId } from '../../store/hash';
import './GremiosPage.css';

function readGremios(): Gremio[] {
  const state = extras.state;
  if (!state.gremios) {
    // First visit: one sample guild with the workshops already in the sample order.
    state.gremios = [
      {
        id: randomId(),
        name: 'Gremio de tejedores del Colca (ejemplo)',
        city: 'Arequipa',
        supplierIds: store.state.suppliers.map((s) => s.id),
        note: 'EJEMPLO: un gremio agrupa talleres que se coordinan para pedidos grandes.',
        source: 'sample',
      },
    ];
    extras.persist();
  }
  return state.gremios;
}

/** /gremios: guilds of workshops. A guild can be brought into a shared order together; each member keeps their own fulfilment record. */
export default function GremiosPage() {
  useDocumentTitle('Gremios');
  const suppliers = useQuery({ queryKey: queryKeys.suppliers.all, queryFn: apiClient.listSuppliers });
  const [gremios, setGremios] = useState<Gremio[]>(readGremios);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [members, setMembers] = useState<string[]>([]);

  function commit(next: Gremio[]) {
    extras.state.gremios = next;
    extras.persist();
    setGremios(next);
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || members.length === 0) return;
    commit([{ id: randomId(), name: name.trim(), city: city.trim(), supplierIds: members, note: '', source: 'manual' }, ...gremios]);
    setName('');
    setCity('');
    setMembers([]);
  }

  const nameOf = (id: string) => suppliers.data?.find((s) => s.id === id)?.name ?? 'Taller';

  return (
    <div className="gremios">
      <PageHeader title="Gremios" subtitle="Talleres que se coordinan para atender pedidos grandes, cada uno con su propio cobro." />
      <Alert tone="info" title="Pedido compartido">
        Un pedido grande se reparte entre varios talleres de un gremio. Cada taller aporta su parte, cobra directo en su cuenta al
        entregar y construye su propia ficha de cumplimiento. <Link to="/orders/nuevo">Crear un pedido compartido</Link>
      </Alert>

      <ul className="gremios__list">
        {gremios.map((g) => (
          <li key={g.id}>
            <div className="gremios__head">
              <h2>{g.name}</h2>
              {g.source === 'sample' && <Badge tone="warning">Ejemplo</Badge>}
              <Button size="sm" variant="ghost" onClick={() => commit(gremios.filter((x) => x.id !== g.id))}>
                Quitar
              </Button>
            </div>
            <p>
              {g.city || 'Sin ciudad'} · {g.supplierIds.length} talleres
            </p>
            {g.note && <small>{g.note}</small>}
            <ul className="gremios__members">
              {g.supplierIds.map((id) => {
                const wallet = store.supplierWallet(id);
                return (
                  <li key={id}>
                    {nameOf(id)}{' '}
                    {wallet ? <Link to={`/ficha/${wallet}`}>Ver ficha de cumplimiento</Link> : <small>(la ficha aparece con su primer cobro)</small>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {gremios.length === 0 && <li>Todavía no hay gremios. Crea el primero abajo.</li>}
      </ul>

      <form className="gremios__form" onSubmit={create}>
        <h2>Crear un gremio</h2>
        <Field label="Nombre del gremio" htmlFor="gremio-name" required>
          <Input id="gremio-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Ciudad" htmlFor="gremio-city">
          <Input id="gremio-city" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <fieldset>
          <legend>Talleres del gremio</legend>
          {(suppliers.data ?? []).map((s) => (
            <label key={s.id} className="gremios__check">
              <input
                type="checkbox"
                checked={members.includes(s.id)}
                onChange={(e) => setMembers((m) => (e.target.checked ? [...m, s.id] : m.filter((x) => x !== s.id)))}
              />
              {s.name}
            </label>
          ))}
          {(suppliers.data ?? []).length === 0 && <p>Primero agrega talleres en Proveedores.</p>}
        </fieldset>
        <Button type="submit" disabled={!name.trim() || members.length === 0}>
          Crear gremio
        </Button>
      </form>
    </div>
  );
}
