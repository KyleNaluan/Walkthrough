import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as checklistDb from '../src/db/checklist.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {ChecklistAnswer, ChecklistEntry, Ticket} from '../src/db/types.js';
import {asUser} from './helpers/auth.js';
import {stores, type UserKey} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/tickets.js');
vi.mock('../src/db/checklist.js');

const items = [
  {id: 1, text: 'Hand-washing sinks are stocked and free to use'},
  {id: 2, text: 'Cold food is held at 41 °F or below'},
  {id: 3, text: 'Hot food is held at 135 °F or above'},
];

/** Ticket 12 on inspection 7; ticket 13 is on inspection 8. */
const finding: Ticket = {
  id: 12,
  description: 'Raw chicken stored above salad',
  severity: 'high',
  deadline: '2099-01-15',
  recordedAt: '2026-10-15T15:30:00.000Z',
  status: 'open',
  inspectionId: 7,
};
const otherFinding: Ticket = {...finding, id: 13, inspectionId: 8};

/** Saved answers by inspection and item, as saveAnswer leaves them. */
let saved: Map<string, {answer: ChecklistAnswer; ticketId: number | null}>;

beforeEach(() => {
  saved = new Map();
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  // Inspections 7 and 8 are both of store 1, owned by ownerA.
  vi.mocked(storesDb.storeIdForInspection).mockImplementation(async (id) =>
    id === 7 || id === 8 ? 1 : null,
  );
  vi.mocked(ticketsDb.listTicketsForInspection).mockImplementation(async (id) =>
    [finding, otherFinding].filter((t) => t.inspectionId === id),
  );
  vi.mocked(checklistDb.listChecklist).mockImplementation(
    async (inspectionId) =>
      items.map((item) => ({
        ...item,
        ...(saved.get(`${inspectionId}:${item.id}`) ?? {
          answer: null,
          ticketId: null,
        }),
      })),
  );
  vi.mocked(checklistDb.saveAnswer).mockImplementation(
    async (inspectionId, itemId, answer, ticketId) => {
      saved.set(`${inspectionId}:${itemId}`, {answer, ticketId});
    },
  );
});

/** Sends an answer to item `itemId` of inspection 7. */
function putAnswer(
  body: object,
  {user = 'inspector', itemId = '1'}: {user?: UserKey; itemId?: string} = {},
) {
  return request(app)
    .put(`/api/inspections/7/checklist/${itemId}`)
    .set(asUser(user))
    .send(body);
}

function getChecklist(user: UserKey = 'inspector') {
  return request(app).get('/api/inspections/7/checklist').set(asUser(user));
}

describe('GET /api/inspections/:inspectionId/checklist (story 15)', () => {
  it('lists every checklist item in order with its answer or none (AC 15.1)', async () => {
    saved.set('7:2', {answer: 'pass', ticketId: null});
    const res = await getChecklist();
    expect(res.status).toBe(200);
    expect(res.body).toEqual<ChecklistEntry[]>([
      {...items[0], answer: null, ticketId: null},
      {...items[1], answer: 'pass', ticketId: null},
      {...items[2], answer: null, ticketId: null},
    ]);
    expect(checklistDb.listChecklist).toHaveBeenCalledWith(7);
  });

  it("sends the store's owner the checklist with its answers (AC 15.5)", async () => {
    saved.set('7:1', {answer: 'fail', ticketId: 12});
    saved.set('7:3', {answer: 'na', ticketId: null});
    const res = await getChecklist('ownerA');
    expect(res.status).toBe(200);
    expect(res.body).toEqual<ChecklistEntry[]>([
      {...items[0], answer: 'fail', ticketId: 12},
      {...items[1], answer: null, ticketId: null},
      {...items[2], answer: 'na', ticketId: null},
    ]);
  });

  it("refuses another owner's checklist (AC 15.5)", async () => {
    const res = await getChecklist('ownerB');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(checklistDb.listChecklist).not.toHaveBeenCalled();
  });

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a checklist request that is not logged in',
    async (headers) => {
      const res = await request(app)
        .get('/api/inspections/7/checklist')
        .set(headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expect(checklistDb.listChecklist).not.toHaveBeenCalled();
    },
  );

  it('sends "Inspection not found" for the checklist of an inspection that does not exist', async () => {
    const res = await request(app)
      .get('/api/inspections/99/checklist')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Inspection not found'});
    expect(checklistDb.listChecklist).not.toHaveBeenCalled();
  });

  it('refuses an inspection ID that is not a number and sends no checklist', async () => {
    const res = await request(app)
      .get('/api/inspections/abc/checklist')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expect(checklistDb.listChecklist).not.toHaveBeenCalled();
  });
});

describe('PUT /api/inspections/:inspectionId/checklist/:itemId (story 15)', () => {
  function expectNothingSaved() {
    expect(checklistDb.saveAnswer).not.toHaveBeenCalled();
  }

  it.each(['pass', 'na'] as const)(
    'saves %s for an inspector and returns it (AC 15.1)',
    async (answer) => {
      const res = await putAnswer({answer});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({...items[0], answer, ticketId: null});
      expect(checklistDb.saveAnswer).toHaveBeenCalledWith(7, 1, answer, null);
    },
  );

  it('lets any inspector answer, not only the one who started it (AC 15.1)', async () => {
    const res = await putAnswer({answer: 'pass'}, {user: 'inspector2'});
    expect(res.status).toBe(200);
    expect(checklistDb.saveAnswer).toHaveBeenCalledWith(7, 1, 'pass', null);
  });

  it('refuses a Fail with no finding and saves nothing (AC 15.2)', async () => {
    const res = await putAnswer({answer: 'fail'});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Record a finding for a failed item',
      fields: {ticketId: 'Record a finding for a failed item'},
    });
    expectNothingSaved();
  });

  it('refuses a Fail whose finding is on another inspection and saves nothing (AC 15.2)', async () => {
    const res = await putAnswer({answer: 'fail', ticketId: 13});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Record a finding for a failed item');
    expectNothingSaved();
  });

  it('saves a Fail with a finding from this inspection (AC 15.2)', async () => {
    const res = await putAnswer({answer: 'fail', ticketId: 12});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({...items[0], answer: 'fail', ticketId: 12});
    expect(checklistDb.saveAnswer).toHaveBeenCalledWith(7, 1, 'fail', 12);
  });

  it('replaces an earlier answer with the new one (AC 15.3)', async () => {
    expect((await putAnswer({answer: 'pass'})).status).toBe(200);
    expect((await putAnswer({answer: 'na'})).status).toBe(200);
    const res = await getChecklist();
    expect(res.body[0]).toEqual({...items[0], answer: 'na', ticketId: null});
  });

  it('drops the finding when a Fail is changed to Pass (AC 15.3)', async () => {
    expect((await putAnswer({answer: 'fail', ticketId: 12})).status).toBe(200);
    const res = await putAnswer({answer: 'pass', ticketId: 12});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({...items[0], answer: 'pass', ticketId: null});
    expect(checklistDb.saveAnswer).toHaveBeenLastCalledWith(7, 1, 'pass', null);
  });

  it.each(['ownerA', 'ownerB'] as const)(
    'refuses a checklist answer from %s with "Access denied" and saves nothing (AC 15.4)',
    async (user) => {
      const res = await putAnswer({answer: 'pass'}, {user});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expect(storesDb.storeIdForInspection).not.toHaveBeenCalled();
      expect(checklistDb.listChecklist).not.toHaveBeenCalled();
      expect(ticketsDb.listTicketsForInspection).not.toHaveBeenCalled();
      expectNothingSaved();
    },
  );

  it('refuses a store owner even when the body is invalid (AC 15.4)', async () => {
    const res = await putAnswer({answer: 'maybe'}, {user: 'ownerA'});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expectNothingSaved();
  });

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a checklist answer that is not logged in and saves nothing',
    async (headers) => {
      const res = await request(app)
        .put('/api/inspections/7/checklist/1')
        .set(headers)
        .send({answer: 'pass'});
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expectNothingSaved();
    },
  );

  it('sends "Inspection not found" and saves nothing for an inspection that does not exist', async () => {
    const res = await request(app)
      .put('/api/inspections/99/checklist/1')
      .set(asUser('inspector'))
      .send({answer: 'pass'});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Inspection not found'});
    expectNothingSaved();
  });

  it('sends "Checklist item not found" and saves nothing for an item that does not exist', async () => {
    const res = await putAnswer({answer: 'pass'}, {itemId: '99'});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Checklist item not found'});
    expectNothingSaved();
  });

  it('refuses an item ID that is not a number and saves nothing', async () => {
    const res = await putAnswer({answer: 'pass'}, {itemId: 'abc'});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expectNothingSaved();
  });

  it('refuses an answer that is not Pass, Fail or N/A and saves nothing', async () => {
    const res = await putAnswer({answer: 'maybe'});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Answer must be Pass, Fail or N/A');
    expect(res.body.fields.answer).toBe('Answer must be Pass, Fail or N/A');
    expectNothingSaved();
  });
});
