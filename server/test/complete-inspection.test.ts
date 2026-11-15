import request from 'supertest';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as checklistDb from '../src/db/checklist.js';
import * as inspectionsDb from '../src/db/inspections.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {ChecklistAnswer, Ticket} from '../src/db/types.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';
import {asUser} from './helpers/auth.js';
import {stores, users, type UserKey} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/tickets.js');
vi.mock('../src/db/inspections.js');
// Real summarize; only the queries are mocked.
vi.mock('../src/db/checklist.js', async (importOriginal) => ({
  ...(await importOriginal<typeof checklistDb>()),
  listChecklist: vi.fn(),
}));

// vi.mock above mocks this module for the routes; this is the real query.
const {completeInspection} = await vi.importActual<typeof inspectionsDb>(
  '../src/db/inspections.js',
);

const items = [
  {id: 1, text: 'Hand-washing sinks are stocked and free to use'},
  {id: 2, text: 'Cold food is held at 41 °F or below'},
  {id: 3, text: 'Hot food is held at 135 °F or above'},
];

/** Ticket 12, the finding for the failed item on inspection 7. */
const finding: Ticket = {
  id: 12,
  description: 'Raw chicken stored above salad',
  severity: 'high',
  deadline: '2099-01-15',
  recordedAt: '2026-10-14T14:20:00.000Z',
  status: 'open',
  inspectionId: 7,
};

const startedAt = '2026-10-14T14:05:00.000Z';
const completedAt = '2026-10-14T15:00:00.000Z';

/** Inspection 7's answers by item, and its completion time once completed. */
let answers: Map<number, ChecklistAnswer>;
let completed: string | null;

/** Answers every item of inspection 7: one Pass, one Fail and one N/A. */
function answerAll() {
  answers.set(1, 'pass');
  answers.set(2, 'fail');
  answers.set(3, 'na');
}

beforeEach(() => {
  answers = new Map();
  completed = null;
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(storesDb.storeIdForInspection).mockImplementation(async (id) =>
    id === 7 ? 1 : null,
  );
  vi.mocked(inspectionsDb.getInspection).mockImplementation(async (id) =>
    id === 7
      ? {
          id: 7,
          startedAt,
          storeId: 1,
          inspectorId: users.inspector.id,
          completedAt: completed,
        }
      : null,
  );
  vi.mocked(inspectionsDb.completeInspection).mockImplementation(async (id) => {
    if (completed) return null;
    completed = completedAt;
    return {
      id,
      startedAt,
      storeId: 1,
      inspectorId: users.inspector.id,
      completedAt,
    };
  });
  vi.mocked(ticketsDb.listTicketsForInspection).mockResolvedValue([finding]);
  vi.mocked(checklistDb.listChecklist).mockImplementation(async () =>
    items.map((item) => ({
      ...item,
      answer: answers.get(item.id) ?? null,
      ticketId: answers.get(item.id) === 'fail' ? 12 : null,
    })),
  );
});

function complete(user: UserKey = 'inspector', inspectionId = '7') {
  return request(app)
    .post(`/api/inspections/${inspectionId}/complete`)
    .set(asUser(user));
}

describe('POST /api/inspections/:inspectionId/complete (story 16)', () => {
  it('completes an inspection with every item answered and records the date and time (AC 16.1)', async () => {
    answerAll();
    const res = await complete();
    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBe(completedAt);
    expect(inspectionsDb.completeInspection).toHaveBeenCalledTimes(1);
    expect(inspectionsDb.completeInspection).toHaveBeenCalledWith(7);
  });

  it('sends the summary of passed, failed and N/A items and the findings (AC 16.1)', async () => {
    answerAll();
    const res = await complete();
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({pass: 1, fail: 1, na: 1});
    expect(res.body.tickets).toEqual([finding]);
  });

  it('lets any inspector complete it, not only the one who started it (AC 16.1)', async () => {
    answerAll();
    const res = await complete('inspector2');
    expect(res.status).toBe(200);
    expect(inspectionsDb.completeInspection).toHaveBeenCalledWith(7);
  });

  it('refuses to complete with an unanswered item, shows "Answer every checklist item first" and completes nothing (AC 16.2)', async () => {
    answers.set(1, 'pass');
    answers.set(2, 'fail');
    const res = await complete();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: 'Answer every checklist item first'});
    expect(inspectionsDb.completeInspection).not.toHaveBeenCalled();
    const after = await request(app)
      .get('/api/inspections/7')
      .set(asUser('inspector'));
    expect(after.body.completedAt).toBeNull();
  });

  it('refuses to complete an inspection with no answers (AC 16.2)', async () => {
    const res = await complete();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: 'Answer every checklist item first'});
    expect(inspectionsDb.completeInspection).not.toHaveBeenCalled();
  });

  it('refuses to complete an inspection again and keeps its first time (AC 16.3)', async () => {
    answerAll();
    expect((await complete()).status).toBe(200);
    const res = await complete('inspector2');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: 'This inspection is already completed'});
    expect(inspectionsDb.completeInspection).toHaveBeenCalledTimes(1);
    const after = await request(app)
      .get('/api/inspections/7')
      .set(asUser('inspector'));
    expect(after.body.completedAt).toBe(completedAt);
  });

  it('refuses a complete that another request finished first (AC 16.3)', async () => {
    answerAll();
    vi.mocked(inspectionsDb.completeInspection).mockResolvedValueOnce(null);
    const res = await complete();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: 'This inspection is already completed'});
  });

  it.each(['ownerA', 'ownerB'] as const)(
    'refuses to let %s complete an inspection with "Access denied"',
    async (user) => {
      answerAll();
      const res = await complete(user);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expect(storesDb.storeIdForInspection).not.toHaveBeenCalled();
      expect(inspectionsDb.getInspection).not.toHaveBeenCalled();
      expect(checklistDb.listChecklist).not.toHaveBeenCalled();
      expect(inspectionsDb.completeInspection).not.toHaveBeenCalled();
    },
  );

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a complete that is not logged in and completes nothing',
    async (headers) => {
      const res = await request(app)
        .post('/api/inspections/7/complete')
        .set(headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expect(inspectionsDb.completeInspection).not.toHaveBeenCalled();
    },
  );

  it('sends "Inspection not found" and completes nothing for an inspection that does not exist', async () => {
    const res = await complete('inspector', '99');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Inspection not found'});
    expect(inspectionsDb.completeInspection).not.toHaveBeenCalled();
  });

  it('refuses an inspection ID that is not a number and completes nothing', async () => {
    const res = await complete('inspector', 'abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expect(inspectionsDb.completeInspection).not.toHaveBeenCalled();
  });
});

describe('GET /api/inspections/:inspectionId (story 16)', () => {
  it('opens a completed inspection with its completion time and summary (AC 16.1)', async () => {
    answerAll();
    completed = completedAt;
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBe(completedAt);
    expect(res.body.summary).toEqual({pass: 1, fail: 1, na: 1});
  });

  it('opens an inspection in progress with no completion time or summary (AC 16.1)', async () => {
    answerAll();
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBeNull();
    expect(res.body.summary).toBeNull();
    expect(checklistDb.listChecklist).not.toHaveBeenCalled();
  });
});

describe('completeInspection query', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fake Supabase query that records each call and returns `row`. */
  function fakeQuery(row: unknown) {
    const calls: [string, ...unknown[]][] = [];
    const query: Record<string, unknown> = {};
    for (const name of ['from', 'update', 'eq', 'is', 'select']) {
      query[name] = (...args: unknown[]) => {
        calls.push([name, ...args]);
        return query;
      };
    }
    query.maybeSingle = async () => ({data: row, error: null});
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce(
      query as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    return calls;
  }

  it('completeInspection sets the time only on an inspection still in progress (AC 16.1)', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(completedAt);
    const calls = fakeQuery({
      inspection_id: 7,
      started_at: startedAt,
      store_id: 1,
      inspector_id: users.inspector.id,
      completed_at: completedAt,
    });
    expect(await completeInspection(7)).toEqual({
      id: 7,
      startedAt,
      storeId: 1,
      inspectorId: users.inspector.id,
      completedAt,
    });
    expect(calls).toEqual([
      ['from', 'inspection'],
      ['update', {completed_at: completedAt}],
      ['eq', 'inspection_id', 7],
      ['is', 'completed_at', null],
      [
        'select',
        'inspection_id, started_at, store_id, inspector_id, completed_at',
      ],
    ]);
    fakeQuery(null);
    expect(await completeInspection(7)).toBeNull();
  });
});
