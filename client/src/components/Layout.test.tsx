import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {readSession} from '../auth/session';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {owner} from '../test/users';

describe('Layout', () => {
  it("shows the app name, the user's name and the nav", () => {
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    expect(screen.getByText('Walkthrough')).toBeInTheDocument();
    expect(screen.getByText('Sam Carter')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Stores'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Tickets'})).toBeInTheDocument();
  });

  it('Log out clears the session and shows the login page', () => {
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    fireEvent.click(screen.getByRole('button', {name: 'Log out'}));
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(readSession()).toBeNull();
  });
});
