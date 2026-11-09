import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { IntroPlayer } from '../../intro/IntroPlayer';

/** /video: the explainer on demand (landing hero, help button). Closing returns to where the person came from. */
export default function VideoPage() {
  useDocumentTitle('Cómo funciona PROCTO');
  const navigate = useNavigate();
  const { key } = useLocation();
  const close = useCallback(() => (key === 'default' ? navigate('/', { replace: true }) : navigate(-1)), [key, navigate]);
  return <IntroPlayer skipLabel="Cerrar video" onDone={close} />;
}
