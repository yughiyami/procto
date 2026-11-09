import { Link } from 'react-router-dom';
import { useProfile } from '../profile/useProfile';

/** Shows whose business the person is working on, from the local profile. */
export function CurrentBusiness() {
  const profile = useProfile();
  return (
    <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
      Negocio actual: <strong>{profile.name || 'Sin nombre todavía'}</strong>
      {' · '}
      <Link to="/negocio">Ver mi negocio</Link>
    </p>
  );
}
