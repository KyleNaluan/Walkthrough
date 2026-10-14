import {fireEvent, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner, stores} from '../test/users';

describe('StoresPage', () => {
  it('lists every store with its name and address for an inspector (AC 2.1)', async () => {
    stubApi({'/api/stores': stores});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    expect(await screen.findByText('3 stores')).toBeInTheDocument();
    expect(screen.getByText('All stores')).toBeInTheDocument();
    for (const store of stores) {
      const row = screen.getByRole('link', {name: new RegExp(store.name)});
      expect(within(row).getByText(store.address)).toBeInTheDocument();
    }
  });

  it("opens a store's detail page when it is chosen (AC 2.2)", async () => {
    stubApi({'/api/stores': stores, '/api/stores/3': stores[2]});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    fireEvent.click(await screen.findByRole('link', {name: /River Market/}));
    expect(
      await screen.findByRole('heading', {name: 'River Market'}),
    ).toBeInTheDocument();
    expect(screen.getByText('S-0003')).toBeInTheDocument();
    expect(screen.getByText('3 River Rd')).toBeInTheDocument();
  });

  it('shows an owner only the stores the server sends, as their own (AC 2.3)', async () => {
    const fetch = stubApi({'/api/stores': stores.slice(0, 2)});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    expect(await screen.findByText('2 stores')).toBeInTheDocument();
    expect(screen.getByText('Your stores')).toBeInTheDocument();
    expect(screen.queryByText('All stores')).not.toBeInTheDocument();
    expect(screen.queryByText('River Market')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/stores', expect.anything());
  });

  it('shows "No stores" when there are none (AC 2.4)', async () => {
    stubApi({'/api/stores': []});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    expect(await screen.findByText('No stores')).toBeInTheDocument();
    expect(document.querySelector('a[href^="/stores/"]')).toBeNull();
  });

  it("shows the server's message when the list cannot load", async () => {
    stubApi({
      '/api/stores': Response.json(
        {error: 'Internal server error'},
        {status: 500},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Internal server error',
    );
  });
});
