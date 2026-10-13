import {Navigate, Outlet, useLocation} from 'react-router';
import type {Role} from '../types';
import {landingPathFor, useAuth} from './useAuth';

/**
 * Renders the child routes only for a logged-in user with one of `roles`
 * (any role if omitted). Others go to the login page or their landing page.
 */
export function ProtectedRoute({roles}: {roles?: Role[]}) {
  const {user} = useAuth();
  const location = useLocation();
  if (!user) {
    // replace, so Back doesn't return to the protected page.
    return <Navigate to="/login" replace state={{from: location.pathname}} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={landingPathFor(user.role)} replace />;
  }
  return <Outlet />;
}
