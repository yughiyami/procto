import { useState } from 'react';
import { Alert, Button } from '@izumi/ui';
import { extras } from '../../lib/apiClient';
import { randomId } from '../../store/hash';

type Photo = { id: string; label: string; url: string; createdAt: string };

const readPhotos = (): Photo[] => ((extras.state as { photos?: Photo[] }).photos ??= []);

/** Approved product photos kept in this browser. Nothing is uploaded or sent. */
export function PhotoLibrary({ onSelect }: { onSelect: (url: string) => void }) {
  const [photos, setPhotos] = useState<Photo[]>(readPhotos);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  function commit(next: Photo[]) {
    (extras.state as { photos?: Photo[] }).photos = next;
    extras.persist();
    setPhotos(next);
  }

  async function save() {
    setError('');
    if (!consent || !label.trim()) return setError('Añade un nombre y autoriza el uso de la foto.');
    let finalUrl = url.trim();
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
        return setError('Selecciona una imagen JPG, PNG o WebP de hasta 512 KB para guardarla en este navegador.');
      }
      finalUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.readAsDataURL(file);
      }).catch(() => '');
    } else if (!/^https:\/\//i.test(finalUrl)) {
      return setError('Pega un enlace que empiece con https://');
    }
    if (!finalUrl) return setError('No se pudo guardar la foto.');
    const photo: Photo = { id: randomId(), label: label.trim(), url: finalUrl, createdAt: new Date().toISOString() };
    commit([photo, ...photos]);
    onSelect(photo.url);
    setLabel('');
    setUrl('');
    setFile(null);
    setConsent(false);
  }

  return (
    <div className="conversation__photos">
      <p>Fotos aprobadas del negocio. Se guardan solo en este navegador. Guardar no envía un mensaje.</p>
      <div className="conversation__photo-grid">
        {photos.map((photo) => (
          <div key={photo.id} className="conversation__photo-card">
            <strong>{photo.label}</strong>
            <Button type="button" size="sm" variant="secondary" onClick={() => onSelect(photo.url)}>
              Usar foto
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => commit(photos.filter((p) => p.id !== photo.id))}>
              Quitar
            </Button>
          </div>
        ))}
      </div>
      {photos.length === 0 && <p>Aún no hay fotos. Añade la primera abajo.</p>}
      <details>
        <summary>Añadir una foto</summary>
        <label>
          Producto o descripción
          <input maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Polos de algodón azul" />
        </label>
        <label>
          Seleccionar foto (máximo 512 KB)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUrl(''); }} />
        </label>
        {!file ? (
          <label>
            O pega un enlace HTTPS
            <input type="url" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
        ) : (
          <p>{file.name}</p>
        )}
        <label>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Tengo permiso para usar esta foto.
        </label>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="button" onClick={() => void save()}>
          Guardar foto
        </Button>
      </details>
    </div>
  );
}
