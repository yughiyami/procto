import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {ApiError,createHttpClient} from '@izumi/api-client';
import {Alert,Button,PageHeader} from '@izumi/ui';
import {clearToken,getToken} from '../../auth/tokenStorage';
import './DemoPage.css';

const http=createHttpClient({baseUrl:import.meta.env.VITE_API_URL??'http://localhost:3017',getToken,onUnauthorized:()=>{clearToken();window.location.assign('/login');}});
type Draft={product:string;quantity:number;unitPriceCents:number;unitCostCents:number};
type Preview={source:'deepseek'|'template';draft:Draft;notice:string};
const amount=(cents:number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(cents/100);
const errorText=(e:unknown)=>e instanceof ApiError?e.userMessage():'No se pudo completar la operación.';

export default function DemoPage(){
  const cache=useQueryClient();
  const [confirm,setConfirm]=useState(false),[text,setText]=useState('Simula la venta de 100 polos de algodón para una tienda ficticia de Arequipa.'),[preview,setPreview]=useState<Preview|null>(null);
  const refresh=()=>cache.invalidateQueries();
  const seed=useMutation({mutationFn:()=>http.request<{inserted:Record<string,number>}>('POST','/demo/seed',{body:{confirmSynthetic:true}}),onSuccess:refresh});
  const generate=useMutation({mutationFn:()=>http.request<Preview>('POST','/demo/draft',{body:{text},timeoutMs:35000}),onMutate:()=>{setPreview(null);save.reset();},onSuccess:setPreview});
  const save=useMutation({mutationFn:()=>http.request<{orderId:string;inserted:boolean}>('POST','/demo/import',{body:{confirmSynthetic:true,draft:preview?.draft}}),onSuccess:refresh});
  const busy=seed.isPending||generate.isPending||save.isPending;
  return <main className="demo-page">
    <PageHeader title="Laboratorio DEMO" subtitle="Carga escenarios ficticios en la organización con la que iniciaste sesión."/>
    <Alert tone="warning" title="Solo demostración: sin dinero ni mensajes reales">Los registros se guardan con la etiqueta DEMO. No se envían WhatsApps, no se hacen pagos ni se ejecutan transacciones blockchain. No ingreses teléfonos ni información privada.</Alert>
    <label className="demo-page__consent"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} disabled={busy}/> Entiendo que agregaré datos sintéticos a mi organización, visibles en sus indicadores.</label>
    <section className="demo-page__card">
      <h2>1. Rellena la plataforma</h2>
      <p>Agrega hasta 3 proveedores, 6 empresas del directorio, 4 oportunidades y 4 pedidos en distintos estados, con caja y evidencia sintéticas. No cambia el nombre de tu negocio ni reemplaza registros existentes.</p>
      <Button disabled={!confirm||busy} onClick={()=>seed.mutate()}>{seed.isPending?'Cargando…':'Cargar datos DEMO en mi organización'}</Button>
      {seed.isSuccess&&<Alert tone="success" title="Carga completada">Nuevos: {seed.data.inserted.suppliers} proveedores, {seed.data.inserted.companies} empresas, {seed.data.inserted.opportunities} oportunidades, {seed.data.inserted.orders} pedidos. Repetir no duplica los mismos datos.</Alert>}
      {seed.isError&&<Alert tone="danger" title="No se pudo cargar">{errorText(seed.error)}</Alert>}
    </section>
    <section className="demo-page__card">
      <h2>2. Pídele otro escenario a PACO</h2>
      <label htmlFor="demo-description">Describe productos y cantidades ficticias</label>
      <textarea id="demo-description" rows={4} maxLength={2000} value={text} disabled={busy} onChange={e=>{setText(e.target.value);setPreview(null);save.reset();}}/>
      <Button disabled={busy||!text.trim()} onClick={()=>generate.mutate()}>{generate.isPending?'Preparando borrador…':'Generar borrador sintético'}</Button>
      {generate.isError&&<Alert tone="danger" title="No se pudo generar">{errorText(generate.error)}</Alert>}
      {preview&&<div className="demo-page__preview">
        <strong>{preview.source==='deepseek'?'Borrador IA — DeepSeek':'Plantilla fija — no generada por IA'}</strong><p>{preview.notice}</p>
        <dl><dt>Producto ficticio</dt><dd>{preview.draft.product}</dd><dt>Cantidad</dt><dd>{preview.draft.quantity}</dd><dt>Precio unitario</dt><dd>{amount(preview.draft.unitPriceCents)}</dd><dt>Costo unitario</dt><dd>{amount(preview.draft.unitCostCents)}</dd><dt>Venta ficticia total</dt><dd>{amount(preview.draft.quantity*preview.draft.unitPriceCents)}</dd></dl>
        <p>Al confirmar se creará 1 proveedor, 1 oportunidad ganada y 1 pedido aceptado, con anticipo del 50% y costo total declarado en caja. Todos ficticios; no representan ventas verificadas.</p>
        <Button disabled={!confirm||busy||save.isSuccess} onClick={()=>save.mutate()}>{save.isPending?'Guardando…':'Confirmar e importar escenario DEMO'}</Button>
      </div>}
      {save.isError&&<Alert tone="danger" title="No se pudo importar">{errorText(save.error)}</Alert>}
      {save.isSuccess&&<Alert tone="success" title={save.data.inserted?'Escenario cargado':'Este escenario ya estaba cargado'}><Link to={`/orders/${save.data.orderId}`}>Abrir pedido DEMO</Link>. La repetición del mismo producto, cantidad y precios no duplica registros.</Alert>}
    </section>
    <nav className="demo-page__links" aria-label="Explorar datos DEMO"><Link to="/">Inicio</Link><Link to="/directory">Directorio</Link><Link to="/ventas">Oportunidades</Link><Link to="/orders">Pedidos</Link><Link to="/finanzas">Caja</Link><Link to="/agentes">Agentes</Link><Link to="/blockchain">Cripto</Link></nav>
  </main>;
}
