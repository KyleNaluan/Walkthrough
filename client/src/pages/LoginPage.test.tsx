import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {readSession} from '../auth/session';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {inspector, owner} from '../test/users';

/** Answers the login request with the user, as the server does. */
function stubLoginSuccess(user: typeof inspector) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({token: 'abc', expiresAt, user})),
  );
  return expiresAt;
}

/** Answers the login request as the server does for a refused login. */
function stubLoginRefused() {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({error: 'Email or password is incorrect'}, {status: 401}),
    );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^Email/), {target: {value: email}});
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: {value: password},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Log in'}));
}

describe('LoginPage', () => {
  it('logs in, saves the session and goes to the landing page', async () => {
    const expiresAt = stubLoginSuccess(inspector);
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit(inspector.email, 'secret');
    expect(
      await screen.findByRole('heading', {name: 'Stores'}),
    ).toBeInTheDocument();
    expect(readSession()).toEqual({token: 'abc', expiresAt, user: inspector});
  });

  it("shows the server's message when login fails", async () => {
    stubLoginRefused();
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit('nobody@walkthrough.test', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect',
    );
  });

  it('lands a store owner on their stores page (AC 1.2)', async () => {
    stubLoginSuccess(owner);
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit(owner.email, 'secret');
    expect(
      await screen.findByRole('heading', {name: 'Stores'}),
    ).toBeInTheDocument();
    expect(readSession()?.user).toEqual(owner);
  });

  it('stays on the login page with no session after a refused login (AC 1.3)', async () => {
    stubLoginRefused();
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit(inspector.email, 'wrong');
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(readSession()).toBeNull();
  });

  it('shows the same message for SQL injection text and saves no session (AC 1.7)', async () => {
    const fetch = stubLoginRefused();
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit("' OR 1=1 --", 'anything');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect',
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      email: "' OR 1=1 --",
      password: 'anything',
    });
    expect(readSession()).toBeNull();
  });

  it('offers no way to sign up (AC 1.8)', () => {
    renderWithAuth(<AppRoutes />, {route: '/login'});
    const signUp = /sign ?up|register|create( an)? account/i;
    expect(screen.queryByRole('link', {name: signUp})).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: signUp}),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(signUp)).not.toBeInTheDocument();
  });

  it('clears the error message when a field is edited', async () => {
    stubLoginRefused();
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit(inspector.email, 'wrong');
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: {value: 'again'},
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['', 'secret', 'Email is required'],
    ['a@b.test', '', 'Password is required'],
  ])(
    'marks a blank field and sends nothing: %j / %j',
    (email, password, message) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      renderWithAuth(<AppRoutes />, {route: '/login'});
      submit(email, password);
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('sends a logged-in user to their landing page', () => {
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/login'});
    expect(screen.getByRole('heading', {name: 'Stores'})).toBeInTheDocument();
  });

  it('shows the not-found page for an unknown address', () => {
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/nowhere'});
    expect(
      screen.getByRole('heading', {name: 'Page not found'}),
    ).toBeInTheDocument();
  });
});
