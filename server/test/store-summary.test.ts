import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as inspectionsDb from '../src/db/inspections.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {InspectionSummary} from '../src/db/types.js';
import {asUser} from './helpers/auth.js';
import {stores} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/tickets.js');
vi.mock('../src/db/inspections.js');

const store = {id: 1, name: 'Main St Diner'};

/** A ticket list row for store 1 with this status and deadline. */
function row(
  id: number,
  status: ticketsDb.TicketListRecord['status'],
  deadline: string,
) {
  return {
    id,
    description: `Finding ${id}`,
    severity: 'medium' as const,
    deadline,
    status,
    store,
    reinspectionId: null,
  };
}

const history: InspectionSummary[] = [
  {
    id: 8,
    startedAt: '2026-10-14T14:05:00.000Z',
    inspector: {firstName: 'Ivan', lastName: 'Checks'},
    findingCount: 2,
    completedAt: '2026-10-14T15:00:00.000Z',
  },
  {
    id: 7,
    startedAt: '2026-09-30T15:00:00.000Z',
    inspector: {firstName: 'Ina', lastName: 'Spector'},
    findingCount: 1,
    completedAt: '2026-09-30T16:00:00.000Z',
  },
];

beforeEach(() => {
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((s) => s.id === id) ?? null,
  );
  vi.mocked(ticketsDb.listTickets)
    .mockReset()
    .mockResolvedValue([
      row(1, 'open', '2000-01-01'),
      row(2, 'pending_review', '2999-01-01'),
      row(3, 'resolved', '2000-01-01'),
    ]);
  vi.mocked(inspectionsDb.listInspectionsForStore)
    .mockReset()
    .mockResolvedValue(history);
});

describe('GET /api/stores/:storeId/summary (story 20)', () => {
  it('sends an inspector the open and overdue counts and the last inspection (AC 20.1)', async () => {
    const res = await request(app)
      .get('/api/stores/1/summary')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      openTickets: 2,
      overdueTickets: 1,
      lastInspection: {
        id: 8,
        startedAt: '2026-10-14T14:05:00.000Z',
        completedAt: '2026-10-14T15:00:00.000Z',
      },
    });
    expect(ticketsDb.listTickets).toHaveBeenCalledWith({storeIds: [1]});
    expect(inspectionsDb.listInspectionsForStore).toHaveBeenCalledWith(1);
  });

  it("sends the store's own owner its summary (AC 20.1)", async () => {
    const res = await request(app)
      .get('/api/stores/1/summary')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body.openTickets).toBe(2);
  });

  it('sends zeros and no inspection for a store never inspected (AC 20.2)', async () => {
    vi.mocked(ticketsDb.listTickets).mockResolvedValue([]);
    vi.mocked(inspectionsDb.listInspectionsForStore).mockResolvedValue([]);
    const res = await request(app)
      .get('/api/stores/3/summary')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      openTickets: 0,
      overdueTickets: 0,
      lastInspection: null,
    });
  });

  it("refuses another owner's store and sends no counts (AC 20.3)", async () => {
    const res = await request(app)
      .get('/api/stores/1/summary')
      .set(asUser('ownerB'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(ticketsDb.listTickets).not.toHaveBeenCalled();
    expect(inspectionsDb.listInspectionsForStore).not.toHaveBeenCalled();
  });

  it('sends 404 for a store that does not exist', async () => {
    const res = await request(app)
      .get('/api/stores/99/summary')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Store not found'});
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app).get('/api/stores/1/summary');
    expect(res.status).toBe(401);
    expect(ticketsDb.listTickets).not.toHaveBeenCalled();
  });
});
