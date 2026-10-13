import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {readSession} from '../auth/session';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {inspector} from '../test/users';

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), {target: {value: email}});
  fireEvent.change(screen.getByLabelText('Password'), {
    target: {value: password},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Log in'}));
}

describe('LoginPage', () => {
  it('logs in, saves the session and goes to the landing page', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({token: 'abc', expiresAt, user: inspector}),
        ),
    );
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit(inspector.email, 'secret');
    expect(
      await screen.findByRole('heading', {name: 'Stores'}),
    ).toBeInTheDocument();
    expect(readSession()).toEqual({token: 'abc', expiresAt, user: inspector});
  });

  it("shows the server's message when login fails", async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            {error: 'Email or password is incorrect'},
            {status: 401},
          ),
        ),
    );
    renderWithAuth(<AppRoutes />, {route: '/login'});
    submit('nobody@walkthrough.test', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect',
    );
  });

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
