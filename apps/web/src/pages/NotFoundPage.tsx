import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './NotFoundPage.css';

/**
 * Renders outside the app layout (see routes.tsx `*` route), so it must not
 * assume an authenticated session or render navigation that needs one.
 */
export default function NotFoundPage() {
  useDocumentTitle('Página no encontrada — Izumi');

  return (
    <div className="not-found">
      <p className="not-found__code">404</p>
      <h1 className="not-found__title">No encontramos esta página</h1>
      <p className="not-found__description">
        El enlace que seguiste no existe o ya no está disponible.
      </p>
      <Link className="not-found__link" to="/orders">
        Ir a pedidos
      </Link>
    </div>
  );
}
