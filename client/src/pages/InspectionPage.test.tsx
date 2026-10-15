import {fireEvent, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspection, inspector, owner, stores, ticket} from '../test/users';

describe('InspectionPage', () => {
  it('shows the store, the inspector and the start time (AC 5.1)', async () => {
    stubApi({'/api/inspections/7': inspection});
    // The owner, so the inspector's name is not the logged-in user's.
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    expect(
      await screen.findByRole('heading', {name: 'Main St Diner'}),
    ).toBeInTheDocument();
    expect(screen.getByText('INS-0007')).toBeInTheDocument();
    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    // Some ICU builds put a narrow space before AM.
    expect(screen.getByText(/Oct 14, 2026, 9:05\sAM/)).toBeInTheDocument();
  });

  it("lists the inspection's findings (AC 6.1)", async () => {
    stubApi({
      '/api/inspections/7': {
        ...inspection,
        tickets: [
          ticket,
          {...ticket, id: 13, description: 'No soap at hand sink'},
        ],
      },
    });
    renderWithAuth(<AppRoutes />, {user: owner, route: '/inspections/7'});
    expect(await screen.findByText('T-0012')).toBeInTheDocument();
    expect(
      screen.getByText('Raw chicken stored above salad'),
    ).toBeInTheDocument();
    expect(screen.getByText('T-0013')).toBeInTheDocument();
    expect(screen.getByText('No soap at hand sink')).toBeInTheDocument();
    expect(screen.getAllByText('High')).toHaveLength(2);
    expect(screen.getAllByText('Open')).toHaveLength(2);
    expect(screen.getAllByText('Due Jan 15, 2099')).toHaveLength(2);
    expect(
      screen.queryByText('No findings recorded yet.'),
    ).not.toBeInTheDocument();
  });

  it('says when no findings are recorded yet', async () => {
    stubApi({'/api/inspections/7': inspection});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/7'});
    expect(
      await screen.findByText('No findings recorded yet.'),
    ).toBeInTheDocument();
  });

  it('sends a logged-out visitor to the login page without asking for the inspection (AC 5.4)', () => {
    const fetch = stubApi({'/api/inspections/7': inspection});
    renderWithAuth(<AppRoutes />, {route: '/inspections/7'});
    expect(screen.getByRole('heading', {name: 'Log in'})).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the server message when the inspection cannot be loaded', async () => {
    stubApi({
      '/api/inspections/99': Response.json(
        {error: 'Inspection not found'},
        {status: 404},
      ),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/99'});
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Inspection not found',
    );
  });

  it('links back to the store', async () => {
    stubApi({'/api/inspections/7': inspection, '/api/stores/1': stores[0]});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/inspections/7'});
    fireEvent.click(await screen.findByRole('link', {name: 'Back to store'}));
    expect(await screen.findByText('S-0001')).toBeInTheDocument();
  });
});
