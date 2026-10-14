import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {readSession} from '../auth/session';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner, stores} from '../test/users';

describe('StoreDetailPage', () => {
  it("shows an owner their own store's details (AC 3.1)", async () => {
    stubApi({'/api/stores': stores.slice(0, 2), '/api/stores/1': stores[0]});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    fireEvent.click(await screen.findByRole('link', {name: /Main St Diner/}));
    expect(
      await screen.findByRole('heading', {name: 'Main St Diner'}),
    ).toBeInTheDocument();
    expect(screen.getByText('1 Main St')).toBeInTheDocument();
  });

  it('shows "Access denied" and none of another owner\'s store details (AC 3.2)', async () => {
    stubApi({
      '/api/stores/3': Response.json({error: 'Access denied'}, {status: 403}),
    });
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores/3'});
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.queryByText('River Market')).not.toBeInTheDocument();
    expect(screen.queryByText('3 River Rd')).not.toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page without asking for store data (AC 3.4)', () => {
    const fetch = stubApi({'/api/stores/1': stores[0]});
    renderWithAuth(<AppRoutes />, {route: '/stores/1'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(screen.queryByText('Main St Diner')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('goes to the login page when the server says the session is over (AC 3.4)', async () => {
    stubApi({
      '/api/stores/1': Response.json({error: 'Not logged in'}, {status: 401}),
    });
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores/1'});
    expect(
      await screen.findByRole('heading', {name: 'Log in'}),
    ).toBeInTheDocument();
    expect(screen.queryByText('Main St Diner')).not.toBeInTheDocument();
    expect(readSession()).toBeNull();
  });

  it('shows "Store not found" for a store that does not exist', async () => {
    stubApi({
      '/api/stores/99': Response.json(
        {error: 'Store not found'},
        {status: 404},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/99'});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store not found',
    );
  });

  it('links back to the store list', async () => {
    stubApi({'/api/stores': stores, '/api/stores/1': stores[0]});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    await screen.findByRole('heading', {name: 'Main St Diner'});
    fireEvent.click(screen.getByRole('link', {name: 'Back to stores'}));
    expect(await screen.findByText('3 stores')).toBeInTheDocument();
  });
});
