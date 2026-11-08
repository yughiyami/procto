import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { profileApi } from '../pages/profile/api';

/** Tenant context must stay visible without reading or exposing the access token. */
export function CurrentBusiness() {
  const profile = useQuery({ queryKey: ['business-profile'], queryFn: profileApi.get });
  return <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
    Negocio actual: <strong>{profile.isPending ? 'Cargando…' : profile.data?.name ?? 'No se pudo verificar'}</strong>
    {' · '}<Link to="/negocio">Ver mi negocio</Link>
  </p>;
}
