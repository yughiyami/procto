import { Outlet } from 'react-router-dom';

/** Bare centered container for /login and /i/:token — no nav, no auth chrome. */
export function PublicLayout() {
  return (
    <div className="public-shell">
      <div className="public-shell__panel">
        <Outlet />
      </div>
    </div>
  );
}
