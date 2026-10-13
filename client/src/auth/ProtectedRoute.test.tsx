import {screen} from '@testing-library/react';
import {Route, Routes} from 'react-router';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {inspector, owner} from '../test/users';
import {ProtectedRoute} from './ProtectedRoute';

// A page only inspectors may open, plus the landing page and login page.
const routes = (
  <Routes>
    <Route path="/login" element={<h1>Log in</h1>} />
    <Route path="/stores" element={<h1>Stores</h1>} />
    <Route element={<ProtectedRoute roles={['inspector']} />}>
      <Route path="/inspector-only" element={<h1>Inspector page</h1>} />
    </Route>
  </Routes>
);

describe('ProtectedRoute', () => {
  it('sends a logged-out user to the login page', () => {
    renderWithAuth(routes, {route: '/inspector-only'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(screen.queryByText('Inspector page')).not.toBeInTheDocument();
  });

  it("sends the wrong role to that role's landing page", () => {
    renderWithAuth(routes, {user: owner, route: '/inspector-only'});
    expect(screen.getByRole('heading', {name: 'Stores'})).toBeInTheDocument();
  });

  it('renders the page for the right role', () => {
    renderWithAuth(routes, {user: inspector, route: '/inspector-only'});
    expect(
      screen.getByRole('heading', {name: 'Inspector page'}),
    ).toBeInTheDocument();
  });

  it('protects the app pages', () => {
    renderWithAuth(<AppRoutes />, {route: '/tickets/7'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
  });

  it('treats an expired session as logged out', () => {
    sessionStorage.setItem(
      'walkthrough.session',
      JSON.stringify({token: 't', expiresAt: 1, user: owner}),
    );
    renderWithAuth(<AppRoutes />, {route: '/stores'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
  });
});
