import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon, ProctoMark } from '@izumi/ui';
import { ROLES, useSession } from '../session/SessionContext';
import type { Role } from '../session/SessionContext';
import { shortAddress } from '../stellar/config';
import { navFor } from './navItems';
import './AppLayout.css';

/** Role switcher + wallet pill in the header; role-aware sidebar and mobile bottom bar. */
export function AppLayout() {
  const { role, setRole, connection } = useSession();
  const navigate = useNavigate();
  const items = navFor(role);

  function pick(next: Role) {
    setRole(next);
    navigate(ROLES.find((r) => r.id === next)?.home ?? '/inicio');
  }

  return (
    <div className="app-shell app-shell--simplified">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <header className="app-header">
        <NavLink to="/" className="app-header__brand" aria-label="PROCTO, inicio">
          <ProctoMark size={26} />
          <span>PROCTO</span>
        </NavLink>
        <div className="role-switch" role="group" aria-label="Estás usando PROCTO como">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              className="role-switch__btn"
              aria-pressed={role === r.id}
              title={r.description}
              onClick={() => pick(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <NavLink to="/cuenta" className="wallet-pill" data-connected={connection ? 'yes' : 'no'}>
          <Icon name="lock" size="sm" />
          <span>{connection ? shortAddress(connection.address) : 'Conectar billetera'}</span>
        </NavLink>
      </header>
      <nav className="app-nav app-nav--sidebar" aria-label="Navegación principal">
        <ul>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/inicio'} className="app-nav__link">
                <Icon name={item.icon} />
                <span className="app-nav__label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="app-nav app-nav--bar" aria-label="Navegación móvil">
        <ul className="app-nav__bar-list" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/inicio'} className="app-nav__link">
                <Icon name={item.icon} />
                <span className="app-nav__label">{item.shortLabel ?? item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
