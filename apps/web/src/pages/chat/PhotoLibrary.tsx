import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createHttpClient } from '@izumi/api-client';
import { Alert, Button } from '@izumi/ui';
import { clearToken, getToken } from '../../auth/tokenStorage';

type Photo = { id: string; label: string; url: string; createdAt: string };
const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017', getToken, onUnauthorized: clearToken });

export function PhotoLibrary({ onSelect }: { onSelect: (url: string) => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['chat', 'photos'], queryFn: () => http.request<{items: Photo[]}>('GET', '/chat/photos') });
  const save = useMutation({ mutationFn: async () => {
    if (!consent || !label.trim()) throw new Error('Añade un nombre y autoriza el uso público de la foto.');
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Selecciona una imagen JPG, PNG o WebP de hasta 2 MB.');
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = () => reject(new Error('No pudimos leer la foto.')); reader.readAsDataURL(file); });
      return http.request<Photo>('POST', '/chat/photos/upload', { body: { label: label.trim(), base64, mimetype: file.type, confirmPublic: true } });
    }
    return http.request<Photo>('POST', '/chat/photos', { body: { label: label.trim(), url: url.trim(), confirmPublic: true } });
  }, onSuccess: (photo) => { onSelect(photo.url); setLabel(''); setUrl(''); setFile(null); setConsent(false); void client.invalidateQueries({queryKey: ['chat', 'photos']}); } });
  const revoke = useMutation({ mutationFn: (id: string) => http.request('DELETE', `/chat/photos/${id}`), onSuccess: () => { void client.invalidateQueries({queryKey: ['chat', 'photos']}); } });
  return <div className="conversation__photos">
    <p>Fotos aprobadas del negocio. PACO puede enviarlas cuando el comprador las pida. Guardar no envía un mensaje.</p>
    {query.isPending ? <p role="status">Cargando fotos…</p> : null}
    {query.isError ? <Alert tone="warning">No se pudo cargar la biblioteca.</Alert> : null}
    <div className="conversation__photo-grid">{query.data?.items.map(photo => <div key={photo.id} className="conversation__photo-card">
      <strong>{photo.label}</strong><a href={photo.url} target="_blank" rel="noopener noreferrer">Ver foto</a>
      <Button type="button" size="sm" variant="secondary" onClick={() => onSelect(photo.url)}>Usar foto</Button>
      <Button type="button" size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(photo.id)}>Quitar de PACO</Button>
    </div>)}</div>
    {!query.isPending && query.data?.items.length === 0 ? <p>Aún no hay fotos. Añade la primera abajo.</p> : null}
    <details><summary>Añadir una foto para PACO</summary>
      <label>Producto o descripción<input maxLength={120} value={label} onChange={event => setLabel(event.target.value)} placeholder="Polos de algodón azul" /></label>
      <label>Seleccionar foto (máximo 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setFile(event.target.files?.[0] ?? null); setUrl(''); save.reset(); }} /></label>
      {!file ? <label>O pega un enlace HTTPS<input type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" /></label> : <p>{file.name}</p>}
      <label className="conversation__media-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Autorizo publicar esta foto y que PACO la envíe a quien la solicite. Al subirla se almacena en Wapi; no debe contener datos privados.</label>
      <Button type="button" loading={save.isPending} disabled={!consent || !label.trim() || (!file && !url.trim())} onClick={() => save.mutate()}>Guardar foto aprobada</Button>
      {save.isError ? <Alert tone="danger">{save.error instanceof ApiError ? save.error.userMessage() : save.error.message}</Alert> : null}
      {save.isSuccess ? <p role="status">Foto guardada y seleccionada. Puedes añadir un texto antes de enviarla.</p> : null}
    </details>
    {revoke.isError ? <Alert tone="danger">No se pudo quitar la foto.</Alert> : null}
  </div>;
}
