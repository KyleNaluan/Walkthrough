import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner, stores} from '../test/users';

/** The store rows shown, by name. */
function shownStores(): string[] {
  return stores
    .map((store) => store.name)
    .filter((name) => screen.queryByRole('link', {name: new RegExp(name)}));
}

function search(text: string) {
  fireEvent.change(screen.getByLabelText('Search stores'), {
    target: {value: text},
  });
}

describe('store search (story 19)', () => {
  it('lists only stores whose name matches, in any case (AC 19.1)', async () => {
    stubApi({'/api/stores': stores});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    await screen.findByText('3 stores');
    search('rIvEr');
    expect(shownStores()).toEqual(['River Market']);
    expect(screen.getByText('1 of 3 stores')).toBeInTheDocument();
  });

  it('lists stores whose address matches (AC 19.1)', async () => {
    stubApi({'/api/stores': stores});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    await screen.findByText('3 stores');
    search('WEST ST');
    expect(shownStores()).toEqual(['Westport Cafe']);
  });

  it('shows "No stores match" when nothing matches (AC 19.2)', async () => {
    stubApi({'/api/stores': stores});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    await screen.findByText('3 stores');
    search('zzz');
    expect(screen.getByText('No stores match')).toBeInTheDocument();
    expect(shownStores()).toEqual([]);
  });

  it('lists every store again when the box is emptied (AC 19.3)', async () => {
    stubApi({'/api/stores': stores});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    await screen.findByText('3 stores');
    search('river');
    search('');
    expect(shownStores()).toEqual(stores.map((store) => store.name));
    expect(screen.getByText('3 stores')).toBeInTheDocument();
  });

  // Two buttons clear it: the × in the box, and Clear search under "No
  // stores match".
  it.each([0, 1])(
    'lists every store again after Clear search button %i (AC 19.3)',
    async (which) => {
      stubApi({'/api/stores': stores});
      renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
      await screen.findByText('3 stores');
      search('zzz');
      const buttons = screen.getAllByRole('button', {name: 'Clear search'});
      expect(buttons).toHaveLength(2);
      fireEvent.click(buttons[which]);
      expect(shownStores()).toEqual(stores.map((store) => store.name));
      expect(screen.getByLabelText('Search stores')).toHaveValue('');
    },
  );

  it('shows no clear button while the box is empty', async () => {
    stubApi({'/api/stores': stores});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores'});
    await screen.findByText('3 stores');
    expect(
      screen.queryByRole('button', {name: 'Clear search'}),
    ).not.toBeInTheDocument();
  });

  it("never shows another owner's store in an owner's search (AC 19.4)", async () => {
    // The server sends owner only stores 1 and 2 (AC 2.3).
    const fetch = stubApi({'/api/stores': stores.slice(0, 2)});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores'});
    await screen.findByText('2 stores');
    search('River');
    expect(screen.getByText('No stores match')).toBeInTheDocument();
    expect(screen.queryByText('River Market')).not.toBeInTheDocument();
    // Searching asks the server for nothing new.
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/stores']);
  });

  it('keeps the search when coming back to the list', async () => {
    stubApi({'/api/stores': stores, '/api/stores/3': stores[2]});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores?q=river'});
    expect(await screen.findByText('1 of 3 stores')).toBeInTheDocument();
    expect(screen.getByLabelText('Search stores')).toHaveValue('river');
  });
});
