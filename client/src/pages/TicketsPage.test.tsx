import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspector, owner} from '../test/users';
import type {TicketDetail, TicketSummary} from '../types';

function summary(
  id: number,
  overrides: Partial<TicketSummary> = {},
): TicketSummary {
  return {
    id,
    description: `Finding ${id}`,
    severity: 'medium',
    deadline: '2026-10-20',
    status: 'open',
    overdue: false,
    store: {id: 1, name: 'Main St Diner'},
    reinspectionId: null,
    ...overrides,
  };
}

// In deadline order, as the server sends them.
const tickets = [
  summary(3, {
    description: 'Hand sink blocked by boxes',
    severity: 'low',
    deadline: '2026-10-09',
    overdue: true,
  }),
  summary(1, {
    description: 'Cooler holding at 46°F',
    severity: 'high',
    deadline: '2026-10-10',
    status: 'resolved',
    store: {id: 3, name: 'River Market'},
  }),
  summary(2, {
    description: 'No date labels on prepared foods',
    deadline: '2026-10-30',
    status: 'pending_review',
    store: {id: 2, name: 'Westport Cafe'},
  }),
];

function rows() {
  return within(screen.getByRole('list', {name: 'Tickets'})).getAllByRole(
    'listitem',
  );
}

function statusFilter() {
  return screen.getByRole('combobox', {name: 'Status'});
}

function chooseStatus(label: string) {
  const option = within(statusFilter()).getByRole('option', {name: label});
  fireEvent.change(statusFilter(), {
    target: {value: option.getAttribute('value')},
  });
}

describe('TicketsPage (story 8)', () => {
  it('lists every ticket with its store, description, severity, deadline and status (AC 8.1)', async () => {
    stubApi({'/api/tickets': tickets});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    expect(await screen.findByText('3 tickets')).toBeInTheDocument();
    expect(screen.getByText('All stores')).toBeInTheDocument();

    const [first, second, third] = rows();
    expect(second).toHaveTextContent('T-0001 · River Market');
    expect(second).toHaveTextContent('Cooler holding at 46°F');
    expect(within(second).getByText('High')).toBeInTheDocument();
    expect(within(second).getByText('Resolved')).toBeInTheDocument();
    expect(second).toHaveTextContent('Due Oct 10, 2026');
    expect(first).toHaveTextContent('Main St Diner');
    expect(third).toHaveTextContent('Westport Cafe');
  });

  it('shows an owner the tickets the server sends for their stores (AC 8.2)', async () => {
    const fetch = stubApi({'/api/tickets': [tickets[0], tickets[2]]});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/tickets'});
    expect(await screen.findByText('2 tickets')).toBeInTheDocument();
    expect(screen.getByText('Your stores')).toBeInTheDocument();
    expect(screen.queryByText('River Market', {exact: false})).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/tickets', expect.anything());
  });

  it('keeps the earliest deadline first (AC 8.3)', async () => {
    stubApi({'/api/tickets': tickets});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    await screen.findByText('3 tickets');
    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Oct 9, 2026'),
      expect.stringContaining('Oct 10, 2026'),
      expect.stringContaining('Oct 30, 2026'),
    ]);
    expect(screen.getByText('Earliest deadline first')).toBeInTheDocument();
  });

  it('asks for one status and lists only those tickets (AC 8.4)', async () => {
    const fetch = stubApi({
      '/api/tickets': tickets,
      '/api/tickets?status=pending_review': [tickets[2]],
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    await screen.findByText('3 tickets');

    chooseStatus('Pending review');
    expect(await screen.findByText('1 ticket')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('No date labels on prepared foods');
    expect(fetch).toHaveBeenCalledWith(
      '/api/tickets?status=pending_review',
      expect.anything(),
    );

    chooseStatus('All statuses');
    expect(await screen.findByText('3 tickets')).toBeInTheDocument();
  });

  it('opens with the status filter from the URL', async () => {
    stubApi({'/api/tickets?status=resolved': [tickets[1]]});
    renderWithAuth(<AppRoutes />, {
      user: inspector,
      route: '/tickets?status=resolved',
    });
    expect(await screen.findByText('1 ticket')).toBeInTheDocument();
    expect(statusFilter()).toHaveValue('resolved');
  });

  it('marks an overdue ticket Overdue (AC 8.5)', async () => {
    stubApi({'/api/tickets': tickets});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    await screen.findByText('3 tickets');
    expect(within(rows()[0]).getByText('Overdue')).toBeInTheDocument();
  });

  it('does not mark a resolved ticket Overdue (AC 8.6)', async () => {
    stubApi({'/api/tickets': tickets});
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    await screen.findByText('3 tickets');
    expect(within(rows()[1]).queryByText('Overdue')).toBeNull();
    expect(screen.getAllByText('Overdue')).toHaveLength(1);
  });

  it('shows "No tickets" when there are none (AC 8.7)', async () => {
    stubApi({'/api/tickets': []});
    renderWithAuth(<AppRoutes />, {user: owner, route: '/tickets'});
    expect(await screen.findByText('No tickets')).toBeInTheDocument();
    expect(screen.queryByRole('list', {name: 'Tickets'})).toBeNull();
  });

  it('shows "No tickets" when none match the filter (AC 8.7)', async () => {
    stubApi({
      '/api/tickets': tickets,
      '/api/tickets?status=changes_requested': [],
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    await screen.findByText('3 tickets');
    chooseStatus('Changes requested');
    expect(await screen.findByText('No tickets')).toBeInTheDocument();
    expect(
      screen.getByText('No tickets are changes requested.'),
    ).toBeInTheDocument();
  });

  it("shows the server's message when the list can't be loaded", async () => {
    stubApi({
      '/api/tickets': Response.json({error: 'Server down'}, {status: 500}),
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    expect(await screen.findByRole('alert')).toHaveTextContent('Server down');
  });

  it('opens a ticket and comes back to the list', async () => {
    const detail: TicketDetail = {
      ...tickets[2],
      recordedAt: '2026-10-01T15:00:00Z',
      inspectionId: 1,
      fixes: [],
    };
    stubApi({
      '/api/tickets': tickets,
      '/api/tickets/2': detail,
      '/api/tickets/2/photo': {url: 'https://signed.test/2.png'},
    });
    renderWithAuth(<AppRoutes />, {user: inspector, route: '/tickets'});
    await screen.findByText('3 tickets');

    fireEvent.click(
      screen.getByRole('link', {name: /No date labels on prepared foods/}),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'No date labels on prepared foods',
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', {name: 'Back to tickets'}));
    await waitFor(() => expect(screen.getByText('3 tickets')).toBeVisible());
  });
});
