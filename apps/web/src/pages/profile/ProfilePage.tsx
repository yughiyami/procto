import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createHttpClient } from '@izumi/api-client';
import { Alert, Button, Field, Input, PageHeader } from '@izumi/ui';
import { clearToken, getToken } from '../../auth/tokenStorage';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { profileApi, type Profile, type ProfileInput } from './api';
import './ProfilePage.css';

const key = ['business-profile'];
const errorMessage = (error: unknown) => error instanceof ApiError ? error.userMessage() : 'No se pudo completar la operación. Intenta nuevamente.';
const http=createHttpClient({baseUrl:import.meta.env.VITE_API_URL ?? 'http://localhost:3017',getToken,onUnauthorized:()=>{clearToken();window.location.assign('/login');}});
type Draft={name:string|null;city:string|null;activity:ProfileInput['activity']|null;products:string[]|null;missingFields:string[];requiresHumanConfirmation:true};
type Fields={name:string;city:string;activity:ProfileInput['activity'];products:string};
const labels:Record<string,string>={name:'nombre',city:'ciudad',activity:'actividad',products:'productos'};

function ProfileForm({ profile }: { profile: Profile }) {
  const cache = useQueryClient();
  const [fields,setFields]=useState<Fields>({name:profile.name,city:profile.city,activity:profile.activity,products:profile.products.join(', ')});
  const [description,setDescription]=useState('');
  const [proposal,setProposal]=useState<{draft:Draft;snapshot:Fields}|null>(null);
  const [notice,setNotice]=useState('');
  const [success, setSuccess] = useState(false);
  const suggest=useMutation({mutationFn:async()=>{const snapshot={...fields};const draft=await http.request<Draft>('POST','/profile/draft',{body:{text:description},timeoutMs:35000});return {draft,snapshot};},onSuccess:setProposal});
  const save = useMutation({ mutationFn: profileApi.save, onSuccess: async data => {
    cache.setQueryData(key, data); setSuccess(true);setProposal(null);
  } });
  function update<K extends keyof Fields>(field:K,value:Fields[K]){setFields(current=>({...current,[field]:value}));setSuccess(false);}
  function apply(){
    if(!proposal)return;
    const {draft,snapshot}=proposal;
    setFields(current=>({
      name:current.name===snapshot.name ? draft.name ?? current.name : current.name,
      city:current.city===snapshot.city ? draft.city ?? current.city : current.city,
      activity:current.activity===snapshot.activity ? draft.activity ?? current.activity : current.activity,
      products:current.products===snapshot.products ? draft.products?.join(', ') ?? current.products : current.products,
    }));
    setProposal(null);setSuccess(false);setNotice('Propuesta aplicada al formulario. Conservamos los datos ambiguos y tus cambios posteriores. Revisa y pulsa Guardar mi negocio.');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSuccess(false);
    save.mutate({name:fields.name.trim(),city:fields.city.trim(),activity:fields.activity,products:fields.products.split(',').map(value=>value.trim()).filter(Boolean)});
  }
  return <>
    <section className="business-profile__intro" aria-labelledby="profile-assistant-title">
      <h2 id="profile-assistant-title">PACO te ayuda a crear tu perfil</h2>
      <p>Describe tu negocio. PACO propone datos editables; nunca guarda ni publica por ti. El texto se enviará al modelo configurado: no incluyas claves ni datos sensibles.</p>
      <Field label="Cuéntame qué vendes y cómo trabajas" htmlFor="profile-description"><textarea id="profile-description" rows={4} maxLength={8000} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Vendo chompas de alpaca en Arequipa. Mi negocio se llama PACO." /></Field>
      <Button type="button" loading={suggest.isPending} disabled={!description.trim()||save.isPending} onClick={()=>{setProposal(null);setNotice('');suggest.mutate();}}>Preparar propuesta</Button>
      {suggest.isError && <Alert tone="danger" title="PACO no está disponible">{errorMessage(suggest.error)} Puedes completar el formulario manualmente.</Alert>}
      {proposal && <div aria-live="polite"><h3>Propuesta para revisar</h3><dl>
        <dt>Nombre</dt><dd>{proposal.draft.name ?? 'No indicado'}</dd><dt>Ciudad</dt><dd>{proposal.draft.city ?? 'No indicada'}</dd>
        <dt>Actividad</dt><dd>{proposal.draft.activity===null?'No indicada':({seller:'Vendo mis productos',coordinator:'Coordino una red',both:'Vendo y coordino una red'})[proposal.draft.activity]}</dd>
        <dt>Productos</dt><dd>{proposal.draft.products?.join(', ') ?? 'No indicados'}</dd>
      </dl><p>Por completar: {proposal.draft.missingFields.map(field=>labels[field] ?? field).join(', ') || 'revisa todos los datos antes de guardar'}.</p>
        <Button type="button" disabled={save.isPending} onClick={apply}>Usar propuesta en el formulario</Button> <Button type="button" variant="secondary" onClick={()=>setProposal(null)}>Descartar</Button>
      </div>}
      {notice && <p role="status">{notice}</p>}
    </section>
    <form className="business-profile__form" onSubmit={submit}>
    {success && <Alert tone="success" title="Perfil guardado">Tu información está disponible para tu negocio. No se publicó en el directorio.</Alert>}
    {save.isError && <Alert tone="danger" title="Revisa los datos">{errorMessage(save.error)}</Alert>}
    <Field label="Nombre del negocio" htmlFor="profile-name" required><Input id="profile-name" name="name" required maxLength={200} value={fields.name} onChange={event=>update('name',event.target.value)} autoComplete="organization" /></Field>
    <Field label="Ciudad" htmlFor="profile-city" required><Input id="profile-city" name="city" required maxLength={200} value={fields.city} onChange={event=>update('city',event.target.value)} autoComplete="address-level2" placeholder="Ej. Arequipa" /></Field>
    <Field label="¿Cómo trabajas?" htmlFor="profile-activity" required><select id="profile-activity" name="activity" value={fields.activity} onChange={event=>update('activity',event.target.value as Fields['activity'])}><option value="seller">Vendo mis productos</option><option value="coordinator">Coordino una red de proveedores</option><option value="both">Vendo y coordino una red</option></select></Field>
    <Field label="Productos que ofreces" htmlFor="profile-products" required><Input id="profile-products" name="products" required maxLength={8000} value={fields.products} onChange={event=>update('products',event.target.value)} placeholder="Ej. Polos, chompas, uniformes" /><small>Separa los productos con comas. Máximo 40, de 200 caracteres cada uno.</small></Field>
    <Button type="submit" loading={save.isPending}>Guardar mi negocio</Button>
  </form></>;
}

export default function ProfilePage() {
  useDocumentTitle('Mi negocio');
  const profile = useQuery({ queryKey: key, queryFn: profileApi.get });
  return <div className="business-profile"><PageHeader title="Mi negocio" subtitle="Configura tu actividad y los productos de tu red." />
    <section className="business-profile__intro"><h2>{profile.data?.completed ? 'Tu negocio, en un solo lugar' : 'Cuéntanos qué hace tu negocio'}</h2><p>Este perfil pertenece a tu organización actual. No crea una cuenta nueva ni publica tus datos o envía mensajes a otras empresas.</p></section>
    {profile.isPending && <p role="status">Cargando perfil…</p>}
    {profile.isError && <Alert tone="danger" title="No pudimos cargar tu negocio"><p>{errorMessage(profile.error)}</p><Button variant="secondary" onClick={() => void profile.refetch()}>Reintentar</Button></Alert>}
    {profile.data && <ProfileForm profile={profile.data} />}
  </div>;
}
