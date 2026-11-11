import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as storesDb from '../src/db/stores.js';
import type {Store} from '../src/db/types.js';
import {HttpError} from '../src/lib/errors.js';
import {asUser} from './helpers/auth.js';
import {stores, users} from './helpers/users.js';

vi.mock('../src/db/stores.js');

beforeEach(() => {
  vi.mocked(storesDb.listStores).mockResolvedValue(stores);
  vi.mocked(storesDb.listStoresByOwner).mockImplementation(async (ownerId) =>
    stores.filter((store) => store.ownerId === ownerId),
  );
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(storesDb.storeExists).mockResolvedValue(false);
  vi.mocked(storesDb.createStore).mockImplementation(async (store) => ({
    id: 4,
    ...store,
  }));
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

const STORE_TAKEN = 'A store with this name and address already exists';
const OWNER_NOT_STORE_OWNER = 'Owner must be a store owner account';

const validStore = {
  name: 'Corner Deli',
  address: '1 Main St',
  ownerId: users.ownerB.id,
};

function postStore(body: unknown, as: Parameters<typeof asUser>[0]) {
  return request(app)
    .post('/api/stores')
    .set(asUser(as))
    .send(body as object);
}

describe('POST /api/stores (story 23)', () => {
  it('adds a store for an inspector and returns it (AC 23.1)', async () => {
    const res = await postStore(
      {...validStore, name: '  Corner Deli ', address: ' 1 Main St  '},
      'inspector',
    );
    expect(res.status).toBe(201);
    expect(res.body).toEqual({id: 4, ...validStore});
    expect(storesDb.createStore).toHaveBeenCalledOnce();
    expect(storesDb.createStore).toHaveBeenCalledWith(validStore);
  });

  it("adds a store that then shows in the full list and in its owner's list (AC 23.1)", async () => {
    const saved: Store[] = [...stores];
    vi.mocked(storesDb.createStore).mockImplementation(async (store) => {
      const created = {id: 4, ...store};
      saved.push(created);
      return created;
    });
    vi.mocked(storesDb.listStores).mockImplementation(async () => saved);
    vi.mocked(storesDb.listStoresByOwner).mockImplementation(async (ownerId) =>
      saved.filter((store) => store.ownerId === ownerId),
    );

    await postStore(validStore, 'inspector');
    const all = await request(app).get('/api/stores').set(asUser('inspector'));
    const ownerB = await request(app).get('/api/stores').set(asUser('ownerB'));
    const ownerA = await request(app).get('/api/stores').set(asUser('ownerA'));
    expect(all.body).toContainEqual({id: 4, ...validStore});
    expect(ownerB.body).toContainEqual({id: 4, ...validStore});
    expect(ownerA.body).not.toContainEqual({id: 4, ...validStore});
  });

  it('refuses a store with the same name and address, ignoring case, and saves nothing (AC 23.2)', async () => {
    vi.mocked(storesDb.storeExists).mockResolvedValue(true);
    const res = await postStore(
      {...validStore, name: 'corner deli', address: '1 MAIN ST'},
      'inspector',
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: STORE_TAKEN});
    expect(storesDb.storeExists).toHaveBeenCalledWith(
      'corner deli',
      '1 MAIN ST',
    );
    expect(storesDb.createStore).not.toHaveBeenCalled();
  });

  it('refuses the duplicate when the database catches it first (AC 23.2)', async () => {
    vi.mocked(storesDb.createStore).mockRejectedValue(
      new HttpError(409, STORE_TAKEN),
    );
    const res = await postStore(validStore, 'inspector');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: STORE_TAKEN});
  });

  it('saves "Corner Deli" at a different address as a separate store (AC 23.3)', async () => {
    const res = await postStore(
      {...validStore, address: '9 Oak Ave'},
      'inspector',
    );
    expect(res.status).toBe(201);
    expect(storesDb.storeExists).toHaveBeenCalledWith(
      'Corner Deli',
      '9 Oak Ave',
    );
    expect(storesDb.createStore).toHaveBeenCalledOnce();
  });

  it.each([
    ['name', 'Name is required'],
    ['address', 'Address is required'],
    ['ownerId', 'Owner is required'],
  ])(
    'refuses a missing %s, marks it required and saves nothing (AC 23.4)',
    async (field, message) => {
      const empty = await postStore({...validStore, [field]: ''}, 'inspector');
      const missing = await postStore(
        {...validStore, [field]: undefined},
        'inspector',
      );
      expect(empty.status).toBe(400);
      expect(empty.body.fields).toEqual({[field]: message});
      expect(missing.status).toBe(400);
      expect(missing.body.fields).toEqual({[field]: message});
      expect(storesDb.createStore).not.toHaveBeenCalled();
    },
  );

  it('refuses a name of only spaces (AC 23.4)', async () => {
    const res = await postStore({...validStore, name: '   '}, 'inspector');
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({name: 'Name is required'});
    expect(storesDb.createStore).not.toHaveBeenCalled();
  });

  it("refuses an inspector's account as the owner and saves nothing (AC 23.5)", async () => {
    const res = await postStore(
      {...validStore, ownerId: users.inspector2.id},
      'inspector',
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: OWNER_NOT_STORE_OWNER,
      fields: {ownerId: OWNER_NOT_STORE_OWNER},
    });
    expect(storesDb.createStore).not.toHaveBeenCalled();
  });

  it.each(['00000000-0000-4000-8000-0000000000ff', 'not-an-id'])(
    'refuses owner %s, which is not an account (AC 23.5)',
    async (ownerId) => {
      const res = await postStore({...validStore, ownerId}, 'inspector');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: OWNER_NOT_STORE_OWNER,
        fields: {ownerId: OWNER_NOT_STORE_OWNER},
      });
      expect(storesDb.createStore).not.toHaveBeenCalled();
    },
  );

  it('refuses a store owner with "Access denied" and saves nothing (AC 23.6)', async () => {
    const res = await postStore(validStore, 'ownerB');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(storesDb.storeExists).not.toHaveBeenCalled();
    expect(storesDb.createStore).not.toHaveBeenCalled();
  });

  it('refuses a store owner even when the body is invalid (AC 23.6)', async () => {
    const res = await postStore({}, 'ownerA');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app).post('/api/stores').send(validStore);
    expect(res.status).toBe(401);
    expect(storesDb.createStore).not.toHaveBeenCalled();
  });
});
