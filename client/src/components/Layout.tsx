import {NavLink, Outlet} from 'react-router';
import {useAuth} from '../auth/useAuth';

/** The shell around every logged-in page: header, nav and Log out. */
export function Layout() {
  const {user, logout} = useAuth();
  return (
    <div className="layout">
      <header className="app-header">
        <span className="app-name">Walkthrough</span>
        {user && (
          <span className="user-name">
            {user.firstName} {user.lastName}
          </span>
        )}
        <button type="button" onClick={logout}>
          Log out
        </button>
      </header>
      <nav className="app-nav">
        <NavLink to="/stores">Stores</NavLink>
        <NavLink to="/tickets">Tickets</NavLink>
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
