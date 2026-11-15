import {fireEvent, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AppRoutes} from '../routes';
import {renderWithAuth} from '../test/renderWithAuth';
import {stubApi} from '../test/stubApi';
import {inspection, inspector, owner, stores} from '../test/users';
import type {StoreSummary} from '../types';

const summary: StoreSummary = {
  openTickets: 4,
  overdueTickets: 2,
  lastInspection: {
    id: 7,
    startedAt: '2026-10-14T15:00:00.000Z',
    completedAt: '2026-10-14T17:00:00.000Z',
  },
};

/** The Standing section of the store page, once loaded. */
async function card() {
  const heading = await screen.findByRole('heading', {name: 'Standing'});
  return heading.parentElement!;
}

function openStore(answer: unknown, user = inspector) {
  return {
    fetch: stubApi({
      '/api/stores/1': stores[0],
      '/api/stores/1/inspections': [],
      '/api/stores/1/summary': answer,
      '/api/inspections/7': inspection,
    }),
    view: renderWithAuth(<AppRoutes />, {user, route: '/stores/1'}),
  };
}

describe('StoreSummaryCard (story 20)', () => {
  it('shows the open and overdue counts and the last inspection date (AC 20.1)', async () => {
    openStore(summary);
    const section = await card();
    expect(
      await within(section).findByLabelText('Open tickets count'),
    ).toHaveTextContent('4');
    expect(
      within(section).getByLabelText('Overdue tickets count'),
    ).toHaveTextContent('2');
    expect(within(section).getByText('Oct 14, 2026')).toBeInTheDocument();
    expect(within(section).getByText('Completed')).toBeInTheDocument();
  });

  it('shows the start date and In progress for an unfinished inspection (AC 20.1)', async () => {
    openStore({
      ...summary,
      lastInspection: {
        id: 7,
        startedAt: '2026-11-02T15:00:00.000Z',
        completedAt: null,
      },
    });
    const section = await card();
    expect(await within(section).findByText('Nov 2, 2026')).toBeInTheDocument();
    expect(within(section).getByText('In progress')).toBeInTheDocument();
  });

  it('opens the last inspection from the card', async () => {
    openStore(summary);
    const section = await card();
    fireEvent.click(
      await within(section).findByRole('link', {name: 'Oct 14, 2026'}),
    );
    expect(
      await screen.findByText(`INS-${String(inspection.id).padStart(4, '0')}`),
    ).toBeInTheDocument();
  });

  it('shows "Not inspected yet" and zero counts for a store never inspected (AC 20.2)', async () => {
    openStore({openTickets: 0, overdueTickets: 0, lastInspection: null});
    const section = await card();
    expect(
      await within(section).findByText('Not inspected yet'),
    ).toBeInTheDocument();
    expect(
      within(section).getByLabelText('Open tickets count'),
    ).toHaveTextContent('0');
    expect(
      within(section).getByLabelText('Overdue tickets count'),
    ).toHaveTextContent('0');
  });

  it('shows "Access denied" and no counts when the server refuses (AC 20.3)', async () => {
    openStore(Response.json({error: 'Access denied'}, {status: 403}), owner);
    const section = await card();
    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Access denied',
    );
    expect(
      within(section).queryByLabelText('Open tickets count'),
    ).not.toBeInTheDocument();
  });

  it('asks the server for this store only', async () => {
    const {fetch} = openStore(summary);
    await card();
    await screen.findByLabelText('Open tickets count');
    expect(fetch).toHaveBeenCalledWith(
      '/api/stores/1/summary',
      expect.anything(),
    );
  });
});
