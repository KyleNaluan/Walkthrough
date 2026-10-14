import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/react';
import type {ReactElement} from 'react';
import {MemoryRouter} from 'react-router';
import {AuthProvider} from '../auth/AuthContext';
import {writeSession} from '../auth/session';
import {theme} from '../theme';
import type {User} from '../types';

/** A session that is valid for another hour. */
export function loginAs(user: User): void {
  writeSession({
    token: `test-token-${user.id}`,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user,
  });
}

/** Renders `ui` inside the Mantine theme, for components without routes. */
export function renderWithTheme(ui: ReactElement) {
  return render(<MantineProvider theme={theme}>{ui}</MantineProvider>);
}

/**
 * Renders `ui` (usually <AppRoutes />) at `route`, already logged in as
 * `user`, or logged out when `user` is omitted. `history` lists earlier
 * pages, so Back has somewhere to go.
 */
export function renderWithAuth(
  ui: ReactElement,
  {
    user,
    route = '/',
    history = [],
  }: {user?: User; route?: string; history?: string[]} = {},
) {
  if (user) loginAs(user);
  return renderWithTheme(
    <MemoryRouter initialEntries={[...history, route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}
