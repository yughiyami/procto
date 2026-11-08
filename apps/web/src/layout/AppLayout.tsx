import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, IzumiMark } from '@izumi/ui';
import { useAuth } from '../auth/AuthContext';
import { navItems, primaryNavPaths } from './navItems';
import './AppLayout.css';

/** Four mobile destinations; advanced tools remain accessible from the header. */
export function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [location.pathname]);
  const primary = primaryNavPaths.map((path) => navItems.find((item) => item.to === path)!);
  const secondary = navItems.filter((item) => !primaryNavPaths.includes(item.to));
  function logout() { signOut(); navigate('/login', { replace: true }); }
  return (
    <div className="app-shell app-shell--simplified">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="app-header">
        <NavLink to="/" className="app-header__brand"><IzumiMark size={24} /><span>NEXO+ · Izumi</span></NavLink>
        <details className="app-tools" ref={menu} onKeyDown={(event) => {
          if (event.key === 'Escape' && menu.current) {
            menu.current.open = false;
            menu.current.querySelector('summary')?.focus();
          }
        }}>
          <summary><Icon name="menu" /><span>Herramientas</span></summary>
          <nav className="app-tools__panel" aria-label="Herramientas y cuenta">
            {secondary.map((item) => <NavLink key={item.to} to={item.to}><Icon name={item.icon} />{item.label}</NavLink>)}
            <button type="button" onClick={logout}><Icon name="lock" />Cerrar sesión</button>
          </nav>
        </details>
      </header>
      <nav className="app-nav app-nav--sidebar" aria-label="Navegación principal">
        <ul>{navItems.map((item) => <li key={item.to}>
          <NavLink to={item.to} end={item.to === '/'} className="app-nav__link"><Icon name={item.icon} /><span className="app-nav__label">{item.label}</span></NavLink>
        </li>)}</ul>
      </nav>
      <nav className="app-nav app-nav--bar" aria-label="Navegación móvil">
        <ul className="app-nav__bar-list">{primary.map((item) => <li key={item.to}>
          <NavLink to={item.to} end={item.to === '/'} className="app-nav__link"><Icon name={item.icon} /><span className="app-nav__label">{item.shortLabel ?? item.label}</span></NavLink>
        </li>)}</ul>
      </nav>
      <main id="main-content" className="app-main" tabIndex={-1}><Outlet /></main>
    </div>
  );
}
