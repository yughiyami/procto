import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@izumi/api-client';
import { useAuth } from '../../auth/AuthContext';
import { clearToken, getToken } from '../../auth/tokenStorage';
import './LoginPage.css';

/** The native shell passes only a short-lived DEMO token, never an URL credential. */
function notifyNative(message: Record<string, string>) {
  const nativeWindow = window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } };
  nativeWindow.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

export default function MobileDemoPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const pending = useRef<{ candidate: string; promise: Promise<void> } | null>(null);
  const completed = useRef(false);
  const [status, setStatus] = useState('Esperando la sesión segura de la app Expo…');

  useEffect(() => {
    let active = true;
    async function connect() {
      const candidate = getToken();
      if (!candidate || completed.current) return;
      if (!/^demo_[a-f0-9]{64}$/.test(candidate)) {
        clearToken();
        setStatus('Este acceso solo acepta una sesión DEMO temporal. Abre la app Expo.');
        notifyNative({ type: 'izumi-demo-error', reason: 'unauthorized' });
        return;
      }
      setStatus('Validando tu acceso DEMO…');
      // Share validation during React StrictMode's setup/cleanup/setup cycle.
      if (pending.current?.candidate !== candidate) {
        pending.current = { candidate, promise: signIn(candidate) };
      }
      try {
        await pending.current.promise;
        if (!active || completed.current) return;
        completed.current = true;
        notifyNative({ type: 'izumi-demo-ready' });
        navigate('/', { replace: true });
      } catch (error) {
        if (!active) return;
        pending.current = null;
        const reason = error instanceof ApiError
          ? error.kind === 'unauthorized' ? 'unauthorized' : error.kind === 'network' ? 'network' : 'unknown'
          : 'unknown';
        setStatus(reason === 'network'
          ? 'No se pudo conectar con el servidor. Revisa la conexión desde la app Expo.'
          : 'La sesión DEMO ya no está disponible. Vuelve a entrar desde la app Expo.');
        notifyNative({ type: 'izumi-demo-error', reason });
      }
    }
    const onToken = () => { void connect(); };
    window.addEventListener('izumi:mobile-demo-token', onToken);
    void connect();
    return () => { active = false; window.removeEventListener('izumi:mobile-demo-token', onToken); };
  }, [navigate, signIn]);

  return <div className="login">
    <h1 className="login__title">Tu espacio DEMO</h1>
    <p className="login__lead" role="status" aria-live="polite">{status}</p>
    <p>La app completa el acceso automáticamente. No necesitas pegar una clave.</p>
    <p className="login__help">Datos sintéticos y sesión temporal. Sin mensajes, llamadas, pagos ni operaciones reales.</p>
  </div>;
}
