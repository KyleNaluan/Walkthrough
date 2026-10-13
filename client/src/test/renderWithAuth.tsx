import {render} from '@testing-library/react';
import type {ReactElement} from 'react';
import {MemoryRouter} from 'react-router';
import {AuthProvider} from '../auth/AuthContext';
import {writeSession} from '../auth/session';
import type {User} from '../types';

/** A session that is valid for another hour. */
export function loginAs(user: User): void {
  writeSession({
    token: `test-token-${user.id}`,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user,
  });
}

/**
 * Renders `ui` (usually <AppRoutes />) at `route`, already logged in as
 * `user`, or logged out when `user` is omitted.
 */
export function renderWithAuth(
  ui: ReactElement,
  {user, route = '/'}: {user?: User; route?: string} = {},
) {
  if (user) loginAs(user);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}
