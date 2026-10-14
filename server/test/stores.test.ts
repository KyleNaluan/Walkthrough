import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as storesDb from '../src/db/stores.js';
import {asUser} from './helpers/auth.js';
import {stores} from './helpers/users.js';

vi.mock('../src/db/stores.js');

beforeEach(() => {
  vi.mocked(storesDb.listStores).mockResolvedValue(stores);
  vi.mocked(storesDb.listStoresByOwner).mockImplementation(async (ownerId) =>
    stores.filter((store) => store.ownerId === ownerId),
  );
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
});

describe('GET /api/stores', () => {
  it('lists every store with its name and address for an inspector (AC 2.1)', async () => {
    const res = await request(app).get('/api/stores').set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stores);
    expect(res.body[0]).toMatchObject({
      name: 'Main St Diner',
      address: '1 Main St',
    });
  });

  it('does not give an owner the full list, only their own stores (AC 2.3)', async () => {
    const res = await request(app).get('/api/stores').set(asUser('ownerB'));
    expect(res.status).toBe(200);
    expect(res.body.map((store: {id: number}) => store.id)).toEqual([3]);
    expect(storesDb.listStores).not.toHaveBeenCalled();
  });

  it('is an empty list when there are no stores (AC 2.4)', async () => {
    vi.mocked(storesDb.listStores).mockResolvedValueOnce([]);
    const res = await request(app).get('/api/stores').set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app).get('/api/stores');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/stores/:storeId', () => {
  it('opens any store for an inspector (AC 2.2)', async () => {
    const res = await request(app)
      .get('/api/stores/3')
      .set(asUser('inspector2'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stores[2]);
  });

  it('sends 404 for a store that does not exist', async () => {
    const res = await request(app)
      .get('/api/stores/99')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Store not found'});
  });

  it('refuses an ID that is not a number', async () => {
    const res = await request(app)
      .get('/api/stores/abc')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
  });
});

describe('store owners (story 3)', () => {
  it('shows an owner their own store (AC 3.1)', async () => {
    const res = await request(app).get('/api/stores/1').set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stores[0]);
  });

  it("refuses another owner's store and returns none of its data (AC 3.3)", async () => {
    const res = await request(app).get('/api/stores/3').set(asUser('ownerA'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });

  it("leaves another owner's stores out of an owner's list", async () => {
    const res = await request(app).get('/api/stores').set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([stores[0], stores[1]]);
  });

  it.each(['/api/stores', '/api/stores/1'])(
    'refuses %s with no login and returns no store data (AC 3.4)',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
    },
  );

  it('refuses an invalid token with no store data (AC 3.4)', async () => {
    const res = await request(app)
      .get('/api/stores/1')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Not logged in'});
  });
});
