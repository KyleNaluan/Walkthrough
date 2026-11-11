import {fireEvent, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner} from '../test/users';
import type {User} from '../types';

const STORE_TAKEN = 'A store with this name and address already exists';
const OWNER_NOT_STORE_OWNER = 'Owner must be a store owner account';

const owner2: User = {
  id: 'owner-2',
  firstName: 'Omar',
  lastName: 'Other',
  email: 'owner2@walkthrough.test',
  role: 'store_owner',
};

const owners = [owner, owner2];

const validValues = {
  name: 'Corner Deli',
  address: '1 Main St',
  ownerId: owner2.id,
};

function fill(values: Partial<Record<string, string>>) {
  const labels: Record<string, RegExp> = {
    name: /^Name/,
    address: /^Address/,
    ownerId: /^Owner/,
  };
  for (const [field, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labels[field]), {
      target: {value},
    });
  }
}

function submit() {
  fireEvent.click(screen.getByRole('button', {name: 'Add store'}));
}

/** The JSON body of the POST to add a store, if one was sent. */
function postedBody(fetch: ReturnType<typeof stubApi>) {
  const call = fetch.mock.calls.find(
    ([path, init]) => path === '/api/stores' && init?.method === 'POST',
  );
  return call && JSON.parse(String(call[1]!.body));
}

describe('NewStorePage (story 23)', () => {
  it('adds the store and offers a link to it (AC 23.1)', async () => {
    const fetch = stubApi({
      '/api/users/store-owners': owners,
      'POST /api/stores': {id: 42, ...validValues},
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/new'});
    await screen.findByLabelText(/^Owner/);
    fill({...validValues, name: '  Corner Deli '});
    submit();
    expect(
      await screen.findByText('Store added: Corner Deli'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Open store'})).toHaveAttribute(
      'href',
      '/stores/42',
    );
    expect(postedBody(fetch)).toEqual(validValues);
    // Cleared for the next store.
    expect(screen.getByLabelText(/^Name/)).toHaveValue('');
    expect(screen.getByLabelText(/^Owner/)).toHaveValue('');
  });

  it('shows the duplicate message and keeps what was typed (AC 23.2)', async () => {
    stubApi({
      '/api/users/store-owners': owners,
      'POST /api/stores': Response.json({error: STORE_TAKEN}, {status: 409}),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/new'});
    await screen.findByLabelText(/^Owner/);
    fill(validValues);
    submit();
    expect(await screen.findByText(STORE_TAKEN)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Corner Deli');
    expect(screen.getByLabelText(/^Address/)).toHaveValue('1 Main St');
    expect(screen.getByLabelText(/^Owner/)).toHaveValue(owner2.id);
    expect(screen.queryByText(/Store added/)).not.toBeInTheDocument();
  });

  it('marks every empty field as required and sends nothing (AC 23.4)', async () => {
    const fetch = stubApi({'/api/users/store-owners': owners});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/new'});
    await screen.findByLabelText(/^Owner/);
    fill({name: '   '});
    submit();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
    expect(screen.getByText('Owner is required')).toBeInTheDocument();
    expect(postedBody(fetch)).toBeUndefined();
  });

  it('offers only store owner accounts as owners (AC 23.5)', async () => {
    stubApi({'/api/users/store-owners': owners});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/new'});
    const select = await screen.findByLabelText(/^Owner/);
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Choose an owner',
      'Sam Carter (owner1@walkthrough.test)',
      'Omar Other (owner2@walkthrough.test)',
    ]);
  });

  it("marks the owner with the server's message (AC 23.5)", async () => {
    stubApi({
      '/api/users/store-owners': owners,
      'POST /api/stores': Response.json(
        {
          error: OWNER_NOT_STORE_OWNER,
          fields: {ownerId: OWNER_NOT_STORE_OWNER},
        },
        {status: 400},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/new'});
    await screen.findByLabelText(/^Owner/);
    fill(validValues);
    submit();
    expect(await screen.findByText(OWNER_NOT_STORE_OWNER)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Owner/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByText(/Store added/)).not.toBeInTheDocument();
  });

  it('says when there are no store owners to choose (AC 23.1)', async () => {
    stubApi({'/api/users/store-owners': []});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/new'});
    expect(
      await screen.findByText('No store owner accounts yet'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Add an owner'})).toHaveAttribute(
      'href',
      '/owners/new',
    );
    expect(
      screen.queryByRole('button', {name: 'Add store'}),
    ).not.toBeInTheDocument();
  });

  it('shows a store owner "Access denied", no form and no owner list request (AC 23.6)', () => {
    const fetch = stubApi({});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores/new'});
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Add store'}),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      '/api/users/store-owners',
      expect.anything(),
    );
  });
});
