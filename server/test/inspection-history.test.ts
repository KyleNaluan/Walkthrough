import request from 'supertest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as inspectionsDb from '../src/db/inspections.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {InspectionSummary, Ticket} from '../src/db/types.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';
import {asUser} from './helpers/auth.js';
import {stores, users} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/tickets.js');

/** Inspection 8, then the older inspection 7, newest first. */
const history: InspectionSummary[] = [
  {
    id: 8,
    startedAt: '2026-10-14T14:05:00.000Z',
    inspector: {firstName: 'Ivan', lastName: 'Checks'},
    findingCount: 2,
  },
  {
    id: 7,
    startedAt: '2026-09-30T15:00:00.000Z',
    inspector: {firstName: 'Ina', lastName: 'Spector'},
    findingCount: 1,
  },
];

beforeEach(() => {
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
});

describe('GET /api/stores/:storeId/inspections (story 14)', () => {
  // Only this block fakes listInspectionsForStore; the query tests below use
  // the real one.
  afterEach(() => {
    vi.mocked(inspectionsDb.listInspectionsForStore).mockRestore();
  });

  beforeEach(() => {
    vi.spyOn(inspectionsDb, 'listInspectionsForStore').mockResolvedValue(
      history,
    );
  });

  it.each(['inspector', 'inspector2'] as const)(
    "lists a store's inspections with date, inspector and number of findings for any inspector (AC 14.1)",
    async (user) => {
      const res = await request(app)
        .get('/api/stores/3/inspections')
        .set(asUser(user));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(history);
      expect(inspectionsDb.listInspectionsForStore).toHaveBeenCalledWith(3);
    },
  );

  it("lists the owner's own store's inspections (AC 14.3)", async () => {
    const res = await request(app)
      .get('/api/stores/1/inspections')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(history);
    expect(inspectionsDb.listInspectionsForStore).toHaveBeenCalledWith(1);
  });

  it("refuses another owner's store history and sends no inspection (AC 14.4)", async () => {
    const res = await request(app)
      .get('/api/stores/3/inspections')
      .set(asUser('ownerA'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(inspectionsDb.listInspectionsForStore).not.toHaveBeenCalled();
  });

  it('is an empty list for a store with no inspections (AC 14.5)', async () => {
    vi.mocked(inspectionsDb.listInspectionsForStore).mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/stores/2/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a history request that is not logged in and sends no inspection',
    async (headers) => {
      const res = await request(app)
        .get('/api/stores/1/inspections')
        .set(headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expect(inspectionsDb.listInspectionsForStore).not.toHaveBeenCalled();
    },
  );

  it('sends "Store not found" and no inspection for a store that does not exist', async () => {
    const res = await request(app)
      .get('/api/stores/99/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Store not found'});
    expect(inspectionsDb.listInspectionsForStore).not.toHaveBeenCalled();
  });

  it('refuses a store ID that is not a number and sends no inspection', async () => {
    const res = await request(app)
      .get('/api/stores/abc/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expect(inspectionsDb.listInspectionsForStore).not.toHaveBeenCalled();
  });
});

describe('listInspectionsForStore query', () => {
  /** A fake Supabase query that records each call and returns `rows`. */
  function fakeQuery(rows: unknown[]) {
    const calls: [string, ...unknown[]][] = [];
    const query: Record<string, unknown> = {};
    for (const name of ['from', 'select', 'eq', 'order']) {
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

  it('asks the database for the newest inspection first (AC 14.1)', async () => {
    const calls = fakeQuery([
      {
        inspection_id: 8,
        started_at: '2026-10-14T14:05:00.000Z',
        inspector: {first_name: 'Ivan', last_name: 'Checks'},
        ticket: [{count: 2}],
      },
    ]);
    const result = await inspectionsDb.listInspectionsForStore(3);
    expect(calls).toContainEqual(['eq', 'store_id', 3]);
    const orders = calls.filter(([name]) => name === 'order');
    expect(orders).toEqual([
      ['order', 'started_at', {ascending: false}],
      ['order', 'inspection_id', {ascending: false}],
    ]);
    expect(result).toEqual([history[0]]);
  });
});

describe('GET /api/inspections/:inspectionId (story 14)', () => {
  afterEach(() => {
    vi.mocked(inspectionsDb.getInspection).mockRestore();
  });

  it("opens a past inspection with each finding's status for the store's owner (AC 14.2)", async () => {
    const finding: Ticket = {
      id: 12,
      description: 'Raw chicken stored above salad',
      severity: 'high',
      deadline: '2026-10-07',
      recordedAt: '2026-09-30T15:10:00.000Z',
      status: 'open',
      inspectionId: 7,
    };
    const fixed: Ticket = {
      ...finding,
      id: 13,
      description: 'No soap at hand sink',
      status: 'resolved',
    };
    vi.mocked(storesDb.storeIdForInspection).mockResolvedValue(1);
    vi.spyOn(inspectionsDb, 'getInspection').mockResolvedValue({
      id: 7,
      startedAt: '2026-09-30T15:00:00.000Z',
      storeId: 1,
      inspectorId: users.inspector.id,
    });
    vi.mocked(ticketsDb.listTicketsForInspection).mockResolvedValue([
      finding,
      fixed,
    ]);
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(
      res.body.tickets.map((t: {id: number; status: string}) => [
        t.id,
        t.status,
      ]),
    ).toEqual([
      [12, 'open'],
      [13, 'resolved'],
    ]);
  });
});
