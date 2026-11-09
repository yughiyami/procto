import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {newIdempotencyKey,queryKeys} from '@izumi/api-client';
import {extractMovementDraft} from '../../assist/localRules';
import type {MovementKind} from '@izumi/contracts';
import {Alert,Button,Card,CardBody,CardHeader,Input} from '@izumi/ui';
import {apiClient} from '../../lib/apiClient';
type Draft={kind:MovementKind|null;amountCents:number|null;counterparty:string|null;note:string|null;missingFields:string[];requiresHumanConfirmation:true};

export function FinancialDraftPanel({orderId}:{orderId:string}) {
  const cache=useQueryClient();
  const [text,setText]=useState(''),[draft,setDraft]=useState<Draft|null>(null);
  const [kind,setKind]=useState<MovementKind|' '>(' '),[amount,setAmount]=useState(''),[counterparty,setCounterparty]=useState(''),[note,setNote]=useState(''),[reference,setReference]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false);
  const intent=useRef<{body:string;key:string}|null>(null);
  async function extract(){
    setBusy(true);setError('');setSuccess(false);setDraft(null);intent.current=null;
    try {
      const value:Draft=extractMovementDraft(text);
      setDraft(value);setKind(value.kind ?? ' ');setAmount(value.amountCents===null?'':(value.amountCents/100).toFixed(2));setCounterparty(value.counterparty ?? '');setNote(value.note ?? '');setReference('');
    }catch(e){setError(e instanceof Error?e.message:'No se pudo extraer el borrador');}finally{setBusy(false);}
  }
  async function confirm(){
    const normalized=amount.trim().replace(',','.');
    const cents=Math.round(Number(normalized)*100);
    if(kind===' '||!/^\d+(\.\d{1,2})?$/.test(normalized)||!Number.isSafeInteger(cents)||cents<=0||cents>1_000_000_000||!reference.trim()){setError('Revisa el tipo, monto positivo en soles (hasta 2 decimales) y referencia obligatoria.');return;}
    const body={kind,amountCents:cents,counterparty:counterparty.trim(),note:note.trim(),reference:reference.trim(),verification:'declared' as const};
    const serialized=JSON.stringify(body);
    if(intent.current?.body!==serialized) intent.current={body:serialized,key:newIdempotencyKey()};
    setBusy(true);setError('');
    try {await apiClient.addMovement(orderId,body,intent.current.key);setDraft(null);setText('');setSuccess(true);intent.current=null;await cache.invalidateQueries({queryKey:queryKeys.orders.all});}
    catch(e){setError(e instanceof Error?e.message:'No se pudo registrar el movimiento');}finally{setBusy(false);}
  }
  return <Card><CardHeader title="PACO · borrador financiero"/><CardBody>
    <p>Describe un cobro o pago en soles. PACO propone; tú revisas y registras. Funciona con reglas en tu navegador. No ejecuta pagos ni verifica bancos.</p>
    <label style={{display:'grid',gap:8}}>Texto del movimiento<textarea className="izu-input" rows={3} maxLength={8000} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="Cobré 120 soles al cliente por el adelanto"/></label>
    <Button type="button" disabled={busy||!text.trim()} onClick={()=>void extract()}>{busy?'Procesando…':'Preparar borrador'}</Button>
    {error&&<Alert tone="danger">{error}</Alert>}{success&&<Alert tone="success">Movimiento registrado como declarado.</Alert>}
    {draft&&<form onSubmit={e=>{e.preventDefault();void confirm();}} style={{display:'grid',gap:12,marginTop:16}}>
      <Alert tone="warning">Revisa todos los datos. Falta completar o revisar: {draft.missingFields.join(', ') || 'ninguno'}. La referencia siempre la ingresas tú.</Alert>
      <label>Tipo<select className="izu-input" value={kind} disabled={busy} onChange={e=>setKind(e.target.value as MovementKind|' ')} required><option value=" ">Selecciona</option><option value="customer_receipt">Cobro a cliente</option><option value="supplier_payment">Pago a proveedor</option><option value="other_cost">Otro costo</option><option value="customer_refund">Reembolso a cliente</option></select></label>
      <label>Monto S/<Input inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} required/></label>
      <label>Contraparte<Input value={counterparty} maxLength={200} disabled={busy} onChange={e=>setCounterparty(e.target.value)}/></label>
      <label>Referencia del comprobante o registro<Input value={reference} maxLength={200} disabled={busy} onChange={e=>setReference(e.target.value)} required/></label>
      <label>Nota<Input value={note} maxLength={1000} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
      <Button type="submit" disabled={busy}>Confirmar y registrar como declarado</Button>
    </form>}
  </CardBody></Card>;
}
export default FinancialDraftPanel;
