import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as inspectionsDb from '../src/db/inspections.js';
import * as storesDb from '../src/db/stores.js';
import {asUser} from './helpers/auth.js';
import {stores, users} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/inspections.js');

const startedAt = '2026-10-14T14:05:00.000Z';

beforeEach(() => {
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(inspectionsDb.createInspection).mockImplementation(
    async (storeId, inspectorId) => ({id: 7, startedAt, storeId, inspectorId}),
  );
});

describe('POST /api/stores/:storeId/inspections', () => {
  it('saves an inspection with the inspector, the store and the start time (AC 5.1)', async () => {
    const res = await request(app)
      .post('/api/stores/3/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 7,
      startedAt,
      storeId: 3,
      inspectorId: users.inspector.id,
    });
    expect(inspectionsDb.createInspection).toHaveBeenCalledTimes(1);
    expect(inspectionsDb.createInspection).toHaveBeenCalledWith(
      3,
      users.inspector.id,
    );
  });

  it('takes the inspector from the session, not the request body (AC 5.1)', async () => {
    const res = await request(app)
      .post('/api/stores/3/inspections')
      .set(asUser('inspector'))
      .send({inspectorId: users.inspector2.id, storeId: 1});
    expect(res.status).toBe(201);
    expect(inspectionsDb.createInspection).toHaveBeenCalledWith(
      3,
      users.inspector.id,
    );
  });

  it.each([1, 3, 99])(
    'refuses a store owner with "Access denied" and saves nothing, even for their own store (AC 5.2)',
    async (storeId) => {
      const res = await request(app)
        .post(`/api/stores/${storeId}/inspections`)
        .set(asUser('ownerA'));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
      expect(storesDb.getStore).not.toHaveBeenCalled();
    },
  );

  it('sends "Store not found" and saves nothing for a store that does not exist (AC 5.3)', async () => {
    const res = await request(app)
      .post('/api/stores/99/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Store not found'});
    expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
  });

  it('refuses a store ID that is not a number and saves nothing', async () => {
    const res = await request(app)
      .post('/api/stores/abc/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
  });

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a request that is not logged in and saves nothing (AC 5.4)',
    async (headers) => {
      const res = await request(app)
        .post('/api/stores/3/inspections')
        .set(headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
    },
  );
});
