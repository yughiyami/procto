import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { ApiError } from '@izumi/api-client';
import { Alert, Button, Field, Input } from '@izumi/ui';
import { useAuth } from '../../auth/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './LoginPage.css';

const DEFAULT_API_URL = 'http://localhost:3017';

type LocationState = { from?: Location } | null;

/** Organization API credential entry — the only way into the private app shell. */
export default function LoginPage() {
  useDocumentTitle('Iniciar sesión — Izumi');
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputId = useId();

  if (isAuthenticated) {
    const state = location.state as LocationState;
    const redirectTo = state?.from ? `${state.from.pathname}${state.from.search}` : '/orders';
    return <Navigate to={redirectTo} replace />;
  }

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || token.trim() === '') return;
    setSubmitting(true);
    setErrorMessage(null);
    const candidate = token;
    try {
      await signIn(candidate);
      setToken('');
      const state = location.state as LocationState;
      const redirectTo = state?.from ? `${state.from.pathname}${state.from.search}` : '/orders';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'unauthorized') {
        setErrorMessage('La credencial no fue reconocida. Verifica el token e inténtalo de nuevo.');
      } else if (err instanceof ApiError && err.kind === 'network') {
        setErrorMessage(`No se pudo conectar con la API en ${apiBaseUrl}. Verifica que el servidor esté disponible.`);
      } else {
        setErrorMessage('No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <h1 className="login__title">Iniciar sesión</h1>
      <p className="login__lead">
        Ingresa la credencial de la API de tu organización para acceder al panel de Izumi.
      </p>

      {errorMessage ? (
        <Alert tone="danger" title="No se pudo iniciar sesión">
          {errorMessage}
        </Alert>
      ) : null}

      <form className="login__form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field label="Token de la API" htmlFor={inputId} required>
          <div className="login__token-row">
            <Input
              id={inputId}
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={submitting}
              required
            />
            <button
              type="button"
              className="login__toggle-visibility"
              onClick={() => setShowToken((prev) => !prev)}
              aria-pressed={showToken}
            >
              {showToken ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </Field>

        <Button type="submit" fullWidth loading={submitting} disabled={token.trim() === ''}>
          Ingresar
        </Button>
      </form>

      <div className="login__help">
        <p>
          Esta credencial se genera en el servidor con <code>npm run admin:create</code> y se
          guarda cifrada (hasheada): no se puede recuperar, solo regenerar si se pierde.
        </p>
        <p>
          El token se guarda únicamente en la memoria de esta pestaña (sesión del navegador) y se
          borra al cerrarla. Nunca se comparte ni se muestra de nuevo después de ingresarlo.
        </p>
      </div>
    </div>
  );
}
