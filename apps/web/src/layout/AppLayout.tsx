import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Icon, Modal, ProctoMark } from '@izumi/ui';
import { ROLES, useSession } from '../session/SessionContext';
import type { Role } from '../session/SessionContext';
import { shortAddress } from '../stellar/config';
import { useAutoTour, useTour } from '../tour/TourProvider';
import { barItemsFor, groupedNavFor } from './navItems';
import './AppLayout.css';

/** Role switcher + wallet pill in the header; role-aware sidebar and mobile bottom bar. */
export function AppLayout() {
  const { role, setRole, connection } = useSession();
  const navigate = useNavigate();
  const tour = useTour();
  useAutoTour();
  const groups = groupedNavFor(role);
  const { bar, more } = barItemsFor(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const moreActive = more.some((i) => pathname === i.to || pathname.startsWith(i.to + '/'));

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
        <div className="role-switch" data-tour="role-switch" role="group" aria-label="Estás usando PROCTO como">
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
        <button type="button" className="help-btn" onClick={tour.start} aria-label="Cómo funciona: recorrido guiado" title="Cómo funciona">
          ?
        </button>
        <Link to="/video" className="help-btn" aria-label="Ver video: cómo funciona PROCTO (3 min)" title="Ver video (3 min)">
          <span aria-hidden="true">▶</span>
        </Link>
        <NavLink to="/cuenta" className="wallet-pill" data-connected={connection ? 'yes' : 'no'}>
          <Icon name="lock" size="sm" />
          <span>{connection ? shortAddress(connection.address) : 'Conectar billetera'}</span>
        </NavLink>
      </header>
      <nav className="app-nav app-nav--sidebar" aria-label="Navegación principal">
        {groups.map((group) => (
          <div key={group.id} className="app-nav__group">
            <p className="app-nav__group-title" id={`nav-${group.id}`}>
              {group.label}
            </p>
            <ul aria-labelledby={`nav-${group.id}`}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === '/inicio'} className="app-nav__link" data-tour={item.tour}>
                    <Icon name={item.icon} />
                    <span className="app-nav__label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <nav className="app-nav app-nav--bar" aria-label="Navegación móvil">
        <ul className="app-nav__bar-list" style={{ gridTemplateColumns: `repeat(${bar.length + (more.length ? 1 : 0)}, minmax(0, 1fr))` }}>
          {bar.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/inicio'} className="app-nav__link" data-tour={item.tour}>
                <Icon name={item.icon} />
                <span className="app-nav__label">{item.shortLabel ?? item.label}</span>
              </NavLink>
            </li>
          ))}
          {more.length > 0 && (
            <li>
              <button type="button" className="app-nav__link app-nav__more" data-active={moreActive || undefined} onClick={() => setMoreOpen(true)}>
                <Icon name="menu" />
                <span className="app-nav__label">Más</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Todas las secciones" size="sm">
        <nav aria-label="Todas las secciones" className="app-more">
          {groups.map((group) => (
            <div key={group.id} className="app-nav__group">
              <p className="app-nav__group-title">{group.label}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.to === '/inicio'} className="app-nav__link app-more__link" onClick={() => setMoreOpen(false)}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Modal>
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
