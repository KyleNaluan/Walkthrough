import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner} from '../test/users';

const EMAIL_TAKEN = 'An account with this email already exists';

const newOwner = {
  id: 'owner-9',
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana.lee@walkthrough.test',
  role: 'store_owner',
};

function fill(values: Partial<Record<string, string>>) {
  const labels: Record<string, RegExp> = {
    firstName: /^First name/,
    lastName: /^Last name/,
    email: /^Email/,
    password: /^Temporary password/,
  };
  for (const [field, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labels[field]), {
      target: {value},
    });
  }
}

const validValues = {
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana.lee@walkthrough.test',
  password: 'password123',
};

function submit() {
  fireEvent.click(screen.getByRole('button', {name: 'Create account'}));
}

/** The JSON body of the POST to create an owner, if one was sent. */
function postedBody(fetch: ReturnType<typeof stubApi>) {
  const call = fetch.mock.calls.find(
    ([path, init]) =>
      path === '/api/users/store-owners' && init?.method === 'POST',
  );
  return call && JSON.parse(String(call[1]!.body));
}

describe('NewOwnerPage (story 22)', () => {
  it('creates the account and says the owner can log in (AC 22.1)', async () => {
    const fetch = stubApi({'POST /api/users/store-owners': newOwner});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/owners/new'});
    fill({...validValues, firstName: '  Ana '});
    submit();
    expect(
      await screen.findByText('Account created for Ana Lee'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/They can log in with ana.lee@walkthrough.test/),
    ).toBeInTheDocument();
    expect(postedBody(fetch)).toEqual(validValues);
    // Cleared for the next owner.
    expect(screen.getByLabelText(/^First name/)).toHaveValue('');
  });

  it("marks the email with the server's message when it is taken (AC 22.2)", async () => {
    stubApi({
      'POST /api/users/store-owners': Response.json(
        {error: EMAIL_TAKEN, fields: {email: EMAIL_TAKEN}},
        {status: 409},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/owners/new'});
    fill(validValues);
    submit();
    expect(await screen.findByText(EMAIL_TAKEN)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByText(/Account created/)).not.toBeInTheDocument();
  });

  it('marks every empty field and sends nothing (AC 22.3)', () => {
    const fetch = stubApi({});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/owners/new'});
    fill({firstName: '   '});
    submit();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(postedBody(fetch)).toBeUndefined();
  });

  it('marks an invalid email and sends nothing (AC 22.3)', () => {
    const fetch = stubApi({});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/owners/new'});
    fill({...validValues, email: 'not-an-email'});
    submit();
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(postedBody(fetch)).toBeUndefined();
  });

  it('refuses a password shorter than 8 characters (AC 22.4)', () => {
    const fetch = stubApi({});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/owners/new'});
    fill({...validValues, password: '1234567'});
    submit();
    expect(
      screen.getByText('Password must be at least 8 characters'),
    ).toBeInTheDocument();
    expect(postedBody(fetch)).toBeUndefined();
  });

  it('shows Add owner only to inspectors (AC 22.5)', () => {
    stubApi({'/api/stores': []});
    const {unmount} = renderWithAuth(<AppRoutes />, {
      user: inspector,
      route: '/stores',
    });
    expect(screen.getByRole('link', {name: 'Add owner'})).toBeInTheDocument();
    unmount();
    sessionStorage.clear();
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    expect(
      screen.queryByRole('link', {name: 'Add owner'}),
    ).not.toBeInTheDocument();
  });

  it('shows a store owner "Access denied" and no form (AC 22.5)', () => {
    stubApi({});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/owners/new'});
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Create account'}),
    ).not.toBeInTheDocument();
  });
});
