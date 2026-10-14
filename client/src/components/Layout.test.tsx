import {fireEvent, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it} from 'vitest';
import {readSession} from '../auth/session';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {owner} from '../test/users';

describe('Layout', () => {
  beforeEach(() => {
    stubApi({'/api/stores': []});
  });

  it("shows the app name, the user's name and role, and the nav", () => {
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    expect(screen.getByText('Walkthrough')).toBeInTheDocument();
    expect(screen.getByText('Sam Carter')).toBeInTheDocument();
    expect(screen.getByText('Store owner')).toBeInTheDocument();
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
