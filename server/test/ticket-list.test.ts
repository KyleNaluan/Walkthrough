import request from 'supertest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {TicketListRecord} from '../src/db/tickets.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';
import {today} from '../src/lib/validate.js';
import {asUser} from './helpers/auth.js';
import {stores} from './helpers/users.js';

vi.mock('../src/db/stores.js');

/** A YYYY-MM-DD date `days` from today (negative for the past). */
function inDays(days: number): string {
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function row(
  id: number,
  storeId: number,
  status: TicketListRecord['status'],
  deadline: string,
): TicketListRecord {
  return {
    id,
    description: `Finding ${id}`,
    severity: 'medium',
    deadline,
    status,
    store: {id: storeId, name: stores[storeId - 1].name},
  };
}

describe('GET /api/tickets (story 8)', () => {
  // ownerA owns stores 1 and 2; ownerB owns store 3.
  const all = [
    row(1, 1, 'open', inDays(-3)),
    row(2, 3, 'pending_review', inDays(2)),
    row(3, 2, 'resolved', inDays(-10)),
    row(4, 1, 'changes_requested', inDays(5)),
  ];

  // Only this block fakes listTickets; the query tests below use the real one.
  afterEach(() => {
    vi.mocked(ticketsDb.listTickets).mockRestore();
  });

  beforeEach(() => {
    vi.mocked(storesDb.listStoresByOwner).mockImplementation(async (ownerId) =>
      stores.filter((store) => store.ownerId === ownerId),
    );
    vi.spyOn(ticketsDb, 'listTickets').mockImplementation(
      async ({storeIds, status}) =>
        all.filter(
          (t) =>
            (!storeIds || storeIds.includes(t.store.id)) &&
            (!status || t.status === status),
        ),
    );
  });

  it('lists every ticket with store, description, severity, deadline and status for an inspector (AC 8.1)', async () => {
    const res = await request(app).get('/api/tickets').set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(ticketsDb.listTickets).toHaveBeenCalledWith({
      storeIds: null,
      status: undefined,
    });
    expect(res.body.map((t: {id: number}) => t.id)).toEqual([1, 2, 3, 4]);
    expect(res.body[1]).toEqual({
      id: 2,
      description: 'Finding 2',
      severity: 'medium',
      deadline: inDays(2),
      status: 'pending_review',
      overdue: false,
      store: {id: 3, name: 'River Market'},
    });
  });

  it("lists only the owner's stores' tickets (AC 8.2)", async () => {
    const res = await request(app).get('/api/tickets').set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(ticketsDb.listTickets).toHaveBeenCalledWith({
      storeIds: [1, 2],
      status: undefined,
    });
    expect(res.body.map((t: {id: number}) => t.id)).toEqual([1, 3, 4]);
  });

  it('keeps the order the database sorted by deadline (AC 8.3)', async () => {
    const sorted = [...all].sort((a, b) =>
      a.deadline.localeCompare(b.deadline),
    );
    vi.mocked(ticketsDb.listTickets).mockResolvedValueOnce(sorted);
    const res = await request(app).get('/api/tickets').set(asUser('inspector'));
    expect(res.body.map((t: {id: number}) => t.id)).toEqual([3, 1, 2, 4]);
  });

  it('passes the status filter on and lists only that status (AC 8.4)', async () => {
    const res = await request(app)
      .get('/api/tickets?status=open')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(ticketsDb.listTickets).toHaveBeenCalledWith({
      storeIds: null,
      status: 'open',
    });
    expect(res.body.map((t: {status: string}) => t.status)).toEqual(['open']);
  });

  it('refuses an unknown status', async () => {
    const res = await request(app)
      .get('/api/tickets?status=lost')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown status');
    expect(ticketsDb.listTickets).not.toHaveBeenCalled();
  });

  it('marks an unresolved ticket past its deadline as overdue (AC 8.5)', async () => {
    const res = await request(app).get('/api/tickets').set(asUser('inspector'));
    expect(res.body.find((t: {id: number}) => t.id === 1).overdue).toBe(true);
  });

  it('never marks a resolved ticket overdue (AC 8.6)', async () => {
    const res = await request(app).get('/api/tickets').set(asUser('inspector'));
    expect(res.body.find((t: {id: number}) => t.id === 3).overdue).toBe(false);
  });

  it('is not overdue on the deadline day itself', async () => {
    vi.mocked(ticketsDb.listTickets).mockResolvedValueOnce([
      row(9, 1, 'open', today()),
    ]);
    const res = await request(app).get('/api/tickets').set(asUser('inspector'));
    expect(res.body[0].overdue).toBe(false);
  });

  it('is an empty list when nothing matches the filter (AC 8.7)', async () => {
    const res = await request(app)
      .get('/api/tickets?status=reinspection_scheduled')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(401);
    expect(ticketsDb.listTickets).not.toHaveBeenCalled();
  });
});

describe('listTickets query', () => {
  /** A fake Supabase query that records each call and returns `rows`. */
  function fakeQuery(rows: unknown[]) {
    const calls: [string, ...unknown[]][] = [];
    const query: Record<string, unknown> = {};
    for (const name of ['from', 'select', 'in', 'eq', 'order']) {
      query[name] = (...args: unknown[]) => {
        calls.push([name, ...args]);
        return query;
      };
    }
    query.overrideTypes = async () => ({data: rows, error: null});
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce(
      query as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    return calls;
  }

  const dbRow = {
    ticket_id: 5,
    description: 'Grease on the hood filters',
    severity: 'low',
    deadline: '2026-10-20',
    status: 'open',
    inspection: {store_id: 2, store: {store_id: 2, name: 'Westport Cafe'}},
  };

  it('sorts by deadline, earliest first, then by ID (AC 8.3)', async () => {
    const calls = fakeQuery([dbRow]);
    const result = await ticketsDb.listTickets({storeIds: null});
    const orders = calls.filter(([name]) => name === 'order');
    expect(orders).toEqual([
      ['order', 'deadline'],
      ['order', 'ticket_id'],
    ]);
    expect(calls.some(([name]) => name === 'in')).toBe(false);
    expect(result).toEqual([
      {
        id: 5,
        description: 'Grease on the hood filters',
        severity: 'low',
        deadline: '2026-10-20',
        status: 'open',
        store: {id: 2, name: 'Westport Cafe'},
      },
    ]);
  });

  it("limits an owner's list to their stores and filters by status (AC 8.2, 8.4)", async () => {
    const calls = fakeQuery([]);
    await ticketsDb.listTickets({storeIds: [1, 2], status: 'open'});
    expect(calls).toContainEqual(['in', 'inspection.store_id', [1, 2]]);
    expect(calls).toContainEqual(['eq', 'status', 'open']);
  });

  it('returns nothing without asking the database when the owner has no stores', async () => {
    await expect(ticketsDb.listTickets({storeIds: []})).resolves.toEqual([]);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
