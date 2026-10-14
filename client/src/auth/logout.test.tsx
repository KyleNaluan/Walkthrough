import {fireEvent, screen} from '@testing-library/react';
import {useNavigate} from 'react-router';
import {describe, expect, it, vi} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {owner, stores} from '../test/users';
import {readSession} from './session';

/** The browser's Back button. */
function BackButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back</button>;
}

const ownerApi = {
  '/api/stores': stores.slice(0, 2),
  '/api/stores/1': stores[0],
  '/api/auth/logout': new Response(null, {status: 204}),
};

describe('logging out', () => {
  it('ends the session and shows the login page (AC 4.1)', async () => {
    stubApi(ownerApi);
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    await screen.findByText('2 stores');
    fireEvent.click(screen.getByRole('button', {name: 'Log out'}));
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(readSession()).toBeNull();
  });

  it('asks the server to revoke the token (AC 4.1)', async () => {
    const fetch = stubApi(ownerApi);
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    await screen.findByText('2 stores');
    fireEvent.click(screen.getByRole('button', {name: 'Log out'}));
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer test-token-${owner.id}`,
        }),
      }),
    );
  });

  it('still logs out when the server cannot be reached', async () => {
    stubApi(ownerApi);
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    await screen.findByText('2 stores');
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', {name: 'Log out'}));
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(readSession()).toBeNull();
  });

  it('sends Back to the login page with no store data (AC 4.2)', async () => {
    stubApi(ownerApi);
    renderWithAuth(
      <>
        <AppRoutes />
        <BackButton />
      </>,
      {user: owner, history: ['/stores'], route: '/stores/1'},
    );
    await screen.findByRole('heading', {name: 'Main St Diner'});
    fireEvent.click(screen.getByRole('button', {name: 'Log out'}));
    fireEvent.click(screen.getByRole('button', {name: 'Back'}));
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(screen.queryByText('Main St Diner')).not.toBeInTheDocument();
    expect(screen.queryByText('Westport Cafe')).not.toBeInTheDocument();
  });

  it('sends a reopened store address to the login page with no store data (AC 4.2)', async () => {
    const fetch = stubApi(ownerApi);
    const {unmount} = renderWithAuth(<AppRoutes />, {
      user: owner,
      route: '/stores/1',
    });
    await screen.findByRole('heading', {name: 'Main St Diner'});
    fireEvent.click(screen.getByRole('button', {name: 'Log out'}));
    unmount();
    fetch.mockClear();

    // Typing the address again loads the app afresh in the same tab.
    renderWithAuth(<AppRoutes />, {route: '/stores/1'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(screen.queryByText('Main St Diner')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
