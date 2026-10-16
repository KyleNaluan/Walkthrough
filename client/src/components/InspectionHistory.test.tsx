import {screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner, stores} from '../test/users';
import type {InspectionSummary} from '../types';

/** Store 1's inspections, newest first, as the server sends them. */
const history: InspectionSummary[] = [
  {
    id: 8,
    startedAt: '2026-10-14T15:05:00.000Z',
    inspector: {firstName: 'Ivan', lastName: 'Checks'},
    findingCount: 2,
  },
  {
    id: 7,
    startedAt: '2026-09-30T15:00:00.000Z',
    inspector: {firstName: 'Jordan', lastName: 'Reyes'},
    findingCount: 1,
  },
];

describe('InspectionHistory', () => {
  it('lists every inspection of the store with date, inspector and findings, newest first (AC 14.1)', async () => {
    stubApi({'/api/stores/1': stores[0], '/api/stores/1/inspections': history});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    const list = await screen.findByRole('list', {name: 'Inspections'});
    const rows = within(list).getAllByRole('link');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('INS-0008');
    expect(rows[0]).toHaveTextContent('Oct 14, 2026');
    expect(rows[0]).toHaveTextContent('Ivan Checks');
    expect(rows[0]).toHaveTextContent('2 findings');
    expect(rows[1]).toHaveTextContent('INS-0007');
    expect(rows[1]).toHaveTextContent('Sep 30, 2026');
    expect(rows[1]).toHaveTextContent('Jordan Reyes');
    expect(rows[1]).toHaveTextContent('1 finding');
  });

  it("shows the owner their own store's inspection history (AC 14.3)", async () => {
    stubApi({'/api/stores/1': stores[0], '/api/stores/1/inspections': history});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/stores/1'});
    const list = await screen.findByRole('list', {name: 'Inspections'});
    expect(within(list).getAllByRole('link')).toHaveLength(2);
  });

  it('shows "No inspections yet" for a store with no inspections (AC 14.5)', async () => {
    stubApi({'/api/stores/2': stores[1], '/api/stores/2/inspections': []});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/2'});
    expect(await screen.findByText('No inspections yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('list', {name: 'Inspections'}),
    ).not.toBeInTheDocument();
  });

  it("shows the server's message when the history cannot be loaded", async () => {
    stubApi({
      '/api/stores/1': stores[0],
      '/api/stores/1/inspections': Response.json(
        {error: 'Internal server error'},
        {status: 500},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/stores/1'});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Internal server error',
    );
    expect(screen.getByText('1 Main St')).toBeInTheDocument();
  });
});
