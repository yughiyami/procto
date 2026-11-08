import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

/** react-router `errorElement`: distinguishes a 404 from a thrown loader/render error. */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="route-error" role="alert">
        <h1>Página no encontrada</h1>
        <p>La dirección que intentaste abrir no existe.</p>
      </div>
    );
  }

  return (
    <div className="route-error" role="alert">
      <h1>No pudimos cargar esta página</h1>
      <p>Ocurrió un error inesperado. Intenta volver atrás o recargar.</p>
    </div>
  );
}
