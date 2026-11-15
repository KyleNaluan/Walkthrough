import {screen} from '@testing-library/react';
import {beforeEach, describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner} from '../test/users';

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
});

// AC 21.3: on every page, Stores, Tickets and Log out are in the header,
// with no menu to open first. The header is the same at phone width.
describe('navigation on every page (story 21)', () => {
  const pages = [
    '/stores',
    '/stores/1',
    '/inspections/7',
    '/tickets',
    '/tickets/5',
    '/owners/new',
    '/stores/new',
  ];

  it.each(pages)(
    'shows Stores, Tickets and Log out to an inspector on %s (AC 21.3)',
    async (route) => {
      stubApi({});
      renderWithAuth(<AppRoutes />, {user: inspector, route});
      expect(
        await screen.findByRole('link', {name: 'Stores'}),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', {name: 'Tickets'})).toBeInTheDocument();
      expect(screen.getByRole('button', {name: 'Log out'})).toBeInTheDocument();
    },
  );

  it.each(['/stores', '/stores/1', '/tickets', '/tickets/5'])(
    'shows Stores, Tickets and Log out to a store owner on %s (AC 21.3)',
    async (route) => {
      stubApi({});
      renderWithAuth(<AppRoutes />, {user: owner, route});
      expect(
        await screen.findByRole('link', {name: 'Stores'}),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', {name: 'Tickets'})).toBeInTheDocument();
      expect(screen.getByRole('button', {name: 'Log out'})).toBeInTheDocument();
    },
  );
});
