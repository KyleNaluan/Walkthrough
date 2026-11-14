import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as checklistDb from '../src/db/checklist.js';
import * as storesDb from '../src/db/stores.js';
import type {ChecklistAnswer, ChecklistEntry} from '../src/db/types.js';
import {asUser} from './helpers/auth.js';
import {stores, type UserKey} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/checklist.js');

const items = [
  {id: 1, text: 'Hand-washing sinks are stocked and free to use'},
  {id: 2, text: 'Cold food is held at 41 °F or below'},
  {id: 3, text: 'Hot food is held at 135 °F or above'},
];

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
});

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
