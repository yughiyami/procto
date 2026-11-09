import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Field, Input, PageHeader } from '@izumi/ui';
import { suggestProfile } from '../../assist/localRules';
import type { ProfileDraft } from '../../assist/localRules';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { isProfileComplete, saveProfile } from '../../profile/profileStore';
import type { Activity, BusinessProfile } from '../../profile/profileStore';
import { useProfile } from '../../profile/useProfile';
import { scoreSupplier } from '../../reputation/score';
import { useSession } from '../../session/SessionContext';
import { listChainOrders } from '../../stellar/chain';
import { describeCommission } from '../../stellar/commission';
import { flattenShares } from '../../stellar/shares';
import './ProfilePage.css';

const ACTIVITY_LABEL: Record<Activity, string> = {
  seller: 'Vendo mis productos',
  coordinator: 'Coordino una red',
  both: 'Vendo y coordino una red',
};
const FIELD_LABEL: Record<string, string> = { name: 'nombre', city: 'ciudad', activity: 'actividad', products: 'productos' };

/** "Perfil verificado": completeness + a signing wallet + a track record read from the contract. */
function VerificationCard({ profile }: { profile: BusinessProfile }) {
  const { connection } = useSession();
  const orders = useQuery({
    queryKey: ['chain-orders', 'profile'],
    queryFn: () => listChainOrders(60),
    enabled: Boolean(connection),
  });
  const score = connection && orders.data
    ? scoreSupplier(connection.address, flattenShares(orders.data).map((s) => ({ ...s, offered: s.offerPrice !== undefined })))
    : null;
  const checks = [
    { ok: isProfileComplete(profile), label: 'Datos del negocio completos', hint: 'Nombre, ciudad y productos.' },
    { ok: Boolean(connection), label: 'Billetera conectada', hint: 'Es la cuenta con la que firmas y cobras.' },
    { ok: (score?.paid ?? 0) > 0, label: 'Primer cobro protegido completado', hint: 'Se gana con un pedido real cobrado, no se compra.' },
  ];
  const verified = checks.every((c) => c.ok);
  return (
    <section className="business-profile__intro" aria-labelledby="verified-title">
      <h2 id="verified-title">
        Perfil verificado <Badge tone={verified ? 'success' : 'neutral'}>{verified ? 'Verificado' : 'En camino'}</Badge>
      </h2>
      <ul className="business-profile__checks">
        {checks.map((c) => (
          <li key={c.label} data-ok={c.ok || undefined}>
            <strong>{c.ok ? 'Listo' : 'Pendiente'}: </strong>
            {c.label}. <small>{c.hint}</small>
          </li>
        ))}
      </ul>
      {connection ? (
        <p>
          <Link to={`/ficha/${connection.address}`}>Ver mi ficha de cumplimiento</Link>
          {score && ` · Nivel ${score.level.label}`}
        </p>
      ) : (
        <p>Conecta tu billetera en Mi billetera para ver tu ficha de cumplimiento.</p>
      )}
    </section>
  );
}

function ProCard({ profile }: { profile: BusinessProfile }) {
  return (
    <section className="business-profile__intro" aria-labelledby="pro-title">
      <h2 id="pro-title">
        Cuenta PRO <Badge tone={profile.pro ? 'success' : 'neutral'}>{profile.pro ? 'Activa' : 'No activa'}</Badge>
      </h2>
      <p>{describeCommission(profile.pro)}</p>
      <p>
        PRO cuesta US$ 240 al año y baja la comisión de 3% a 2%. En esta demostración no hay cobro: el interruptor solo cambia la
        comisión que se calcula al activar un cobro protegido.
      </p>
      <label className="business-profile__toggle">
        <input type="checkbox" checked={profile.pro} onChange={(e) => saveProfile({ pro: e.target.checked })} />
        <span>Usar tarifa PRO (2%)</span>
      </label>
    </section>
  );
}

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const [fields, setFields] = useState({ name: profile.name, city: profile.city, activity: profile.activity, products: profile.products.join(', ') });
  const [description, setDescription] = useState('');
  const [proposal, setProposal] = useState<ProfileDraft | null>(null);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  function apply() {
    if (!proposal) return;
    setFields((f) => ({
      name: proposal.name ?? f.name,
      city: proposal.city ?? f.city,
      activity: proposal.activity ?? f.activity,
      products: proposal.products?.join(', ') ?? f.products,
    }));
    setProposal(null);
    setSaved(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    saveProfile({
      name: fields.name.trim(),
      city: fields.city.trim(),
      activity: fields.activity,
      products: fields.products.split(',').map((p) => p.trim()).filter(Boolean).slice(0, 40),
    });
    setSaved(true);
  }

  return (
    <>
      <section className="business-profile__intro" aria-labelledby="profile-assistant-title">
        <h2 id="profile-assistant-title">PACO te ayuda a crear tu perfil</h2>
        <p>Cuéntame qué vendes y cómo trabajas. PACO propone los datos y tú los revisas: nunca guarda ni publica por ti. Esta ayuda funciona en tu navegador y no envía tu texto a ningún servicio.</p>
        <Field label="Cuéntame qué vendes y cómo trabajas" htmlFor="profile-description">
          <textarea id="profile-description" rows={4} maxLength={8000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mi negocio se llama Tejidos Andinos. Estoy en Arequipa. Vendo chompas, ponchos y gorros y coordino talleres." />
        </Field>
        <Button type="button" disabled={!description.trim()} onClick={() => setProposal(suggestProfile(description))}>
          Preparar propuesta
        </Button>
        {proposal && (
          <div aria-live="polite">
            <h3>Propuesta para revisar</h3>
            <dl>
              <dt>Nombre</dt>
              <dd>{proposal.name ?? 'No indicado'}</dd>
              <dt>Ciudad</dt>
              <dd>{proposal.city ?? 'No indicada'}</dd>
              <dt>Actividad</dt>
              <dd>{proposal.activity ? ACTIVITY_LABEL[proposal.activity] : 'No indicada'}</dd>
              <dt>Productos</dt>
              <dd>{proposal.products?.join(', ') ?? 'No indicados'}</dd>
            </dl>
            <p>Por completar: {proposal.missingFields.map((f) => FIELD_LABEL[f] ?? f).join(', ') || 'revisa todos los datos antes de guardar'}.</p>
            <Button type="button" onClick={apply}>
              Usar propuesta en el formulario
            </Button>{' '}
            <Button type="button" variant="secondary" onClick={() => setProposal(null)}>
              Descartar
            </Button>
          </div>
        )}
      </section>
      <form className="business-profile__form" onSubmit={submit}>
        {saved && (
          <Alert tone="success" title="Perfil guardado">
            Tu información quedó en este navegador. No se publicó en ningún directorio.
          </Alert>
        )}
        <Field label="Nombre del negocio" htmlFor="profile-name" required>
          <Input id="profile-name" required maxLength={200} value={fields.name} onChange={(e) => update('name', e.target.value)} autoComplete="organization" />
        </Field>
        <Field label="Ciudad" htmlFor="profile-city" required>
          <Input id="profile-city" required maxLength={200} value={fields.city} onChange={(e) => update('city', e.target.value)} autoComplete="address-level2" placeholder="Ej. Arequipa" />
        </Field>
        <Field label="¿Cómo trabajas?" htmlFor="profile-activity" required>
          <select id="profile-activity" value={fields.activity} onChange={(e) => update('activity', e.target.value as Activity)}>
            {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Productos que ofreces" htmlFor="profile-products" required>
          <Input id="profile-products" required maxLength={8000} value={fields.products} onChange={(e) => update('products', e.target.value)} placeholder="Ej. Polos, chompas, uniformes" />
          <small>Separa los productos con comas. Máximo 40.</small>
        </Field>
        <Button type="submit">Guardar mi negocio</Button>
      </form>
    </>
  );
}

export default function ProfilePage() {
  useDocumentTitle('Mi negocio');
  const profile = useProfile();
  return (
    <div className="business-profile">
      <PageHeader title="Mi negocio" subtitle="Tu perfil, tu cuenta PRO y tu verificación." />
      <section className="business-profile__intro">
        <h2>{isProfileComplete(profile) ? 'Tu negocio, en un solo lugar' : 'Cuéntanos qué hace tu negocio'}</h2>
        <p>Este perfil vive en tu navegador. No crea una cuenta, no se publica y no envía mensajes a otras empresas.</p>
      </section>
      <VerificationCard profile={profile} />
      <ProCard profile={profile} />
      <ProfileForm profile={profile} />
    </div>
  );
}
