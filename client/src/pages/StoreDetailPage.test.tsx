import {act, fireEvent, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {readSession} from '../auth/session';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspection, inspector, owner, stores} from '../test/users';

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

  it('starts an inspection and opens its page (AC 5.1)', async () => {
    const fetch = stubApi({
      '/api/stores/1': stores[0],
      'POST /api/stores/1/inspections': inspection,
      '/api/inspections/7': inspection,
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    fireEvent.click(
      await screen.findByRole('button', {name: 'Start inspection'}),
    );
    expect(await screen.findByText('INS-0007')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {name: 'Main St Diner'}),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/stores/1/inspections',
      expect.objectContaining({method: 'POST'}),
    );
  });

  it('sends one request when Start inspection is pressed twice (AC 5.1)', async () => {
    const fetch = stubApi({
      '/api/stores/1': stores[0],
      'POST /api/stores/1/inspections': inspection,
      '/api/inspections/7': inspection,
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    const button = await screen.findByRole('button', {
      name: 'Start inspection',
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('INS-0007');
    const posts = fetch.mock.calls.filter(
      ([path, init]) =>
        path === '/api/stores/1/inspections' && init?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
  });

  it('stays on the store list when Back is pressed while an inspection is starting (AC 5.1)', async () => {
    const fetch = stubApi({
      '/api/stores': stores,
      '/api/stores/1': stores[0],
      '/api/inspections/7': inspection,
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    const button = await screen.findByRole('button', {
      name: 'Start inspection',
    });
    let respond: (res: Response) => void = () => {};
    fetch.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (respond = resolve)),
    );
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('link', {name: 'Back to stores'}));
    await screen.findByText('3 stores');
    await act(async () => respond(Response.json(inspection, {status: 201})));
    expect(screen.getByText('3 stores')).toBeInTheDocument();
    expect(screen.queryByText('INS-0007')).not.toBeInTheDocument();
  });

  it('does not offer Start inspection to a store owner (AC 5.2)', async () => {
    const fetch = stubApi({'/api/stores/1': stores[0]});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores/1'});
    await screen.findByRole('heading', {name: 'Main St Diner'});
    expect(
      screen.queryByRole('button', {name: 'Start inspection'}),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({method: 'POST'}),
    );
  });

  it('shows "Store not found" when the store is gone and stays on the store page (AC 5.3)', async () => {
    const fetch = stubApi({
      '/api/stores/1': stores[0],
      '/api/stores/1/inspections': [],
      'POST /api/stores/1/inspections': Response.json(
        {error: 'Store not found'},
        {status: 404},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    fireEvent.click(
      await screen.findByRole('button', {name: 'Start inspection'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store not found',
    );
    expect(
      screen.getByRole('heading', {name: 'Main St Diner'}),
    ).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([path]) => path.startsWith('/api/inspections/')),
    ).toBe(false);
  });

  it('goes to the login page when the session ended before Start inspection (AC 5.4)', async () => {
    stubApi({
      '/api/stores/1': stores[0],
      'POST /api/stores/1/inspections': Response.json(
        {error: 'Not logged in'},
        {status: 401},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    fireEvent.click(
      await screen.findByRole('button', {name: 'Start inspection'}),
    );
    expect(
      await screen.findByRole('heading', {name: 'Log in'}),
    ).toBeInTheDocument();
    expect(readSession()).toBeNull();
  });
});
