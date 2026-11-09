import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as usersDb from '../src/db/users.js';
import {HttpError} from '../src/lib/errors.js';
import {asUser} from './helpers/auth.js';
import {users} from './helpers/users.js';

const EMAIL_TAKEN = 'An account with this email already exists';

const validOwner = {
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana.lee@walkthrough.test',
  password: 'password123',
};

const created = {
  id: '00000000-0000-4000-8000-0000000000c1',
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana.lee@walkthrough.test',
  role: 'store_owner' as const,
};

function postOwner(body: unknown, as: Parameters<typeof asUser>[0]) {
  return request(app)
    .post('/api/users/store-owners')
    .set(asUser(as))
    .send(body as object);
}

beforeEach(() => {
  vi.mocked(usersDb.findUserByEmail).mockReset().mockResolvedValue(null);
  vi.mocked(usersDb.createStoreOwner).mockReset().mockResolvedValue(created);
  vi.mocked(usersDb.listStoreOwners).mockReset().mockResolvedValue([]);
});

describe('POST /api/users/store-owners (story 22)', () => {
  it('creates a store owner account for an inspector (AC 22.1)', async () => {
    const res = await postOwner(validOwner, 'inspector');
    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(res.body).not.toHaveProperty('password');
    expect(usersDb.createStoreOwner).toHaveBeenCalledOnce();
    expect(usersDb.createStoreOwner).toHaveBeenCalledWith(validOwner);
  });

  it('trims the names and saves the email in lower case (AC 22.1)', async () => {
    await postOwner(
      {
        ...validOwner,
        firstName: '  Ana ',
        lastName: ' Lee  ',
        email: '  Ana.Lee@Walkthrough.TEST ',
      },
      'inspector',
    );
    expect(usersDb.findUserByEmail).toHaveBeenCalledWith(
      'ana.lee@walkthrough.test',
    );
    expect(usersDb.createStoreOwner).toHaveBeenCalledWith(validOwner);
  });

  it('keeps spaces in the password as typed (AC 22.1)', async () => {
    await postOwner({...validOwner, password: ' pass word '}, 'inspector');
    expect(usersDb.createStoreOwner).toHaveBeenCalledWith({
      ...validOwner,
      password: ' pass word ',
    });
  });

  it('refuses an email that already has an account (AC 22.2)', async () => {
    vi.mocked(usersDb.findUserByEmail).mockResolvedValue(users.ownerA);
    const res = await postOwner(
      {...validOwner, email: 'OWNER1@walkthrough.test'},
      'inspector',
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: EMAIL_TAKEN,
      fields: {email: EMAIL_TAKEN},
    });
    expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
  });

  it('refuses the email when Supabase Auth already has it (AC 22.2)', async () => {
    vi.mocked(usersDb.createStoreOwner).mockRejectedValue(
      new HttpError(409, EMAIL_TAKEN, {email: EMAIL_TAKEN}),
    );
    const res = await postOwner(validOwner, 'inspector');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(EMAIL_TAKEN);
  });

  it.each([
    ['firstName', 'First name is required'],
    ['lastName', 'Last name is required'],
    ['email', 'Email is required'],
  ])('marks %s when it is empty (AC 22.3)', async (field, message) => {
    const res = await postOwner({...validOwner, [field]: ''}, 'inspector');
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({[field]: message});
    expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
  });

  it.each(['firstName', 'lastName', 'email'])(
    'marks %s when it is only spaces or missing (AC 22.3)',
    async (field) => {
      const spaces = await postOwner(
        {...validOwner, [field]: '   '},
        'inspector',
      );
      const missing = await postOwner(
        {...validOwner, [field]: undefined},
        'inspector',
      );
      expect(spaces.status).toBe(400);
      expect(spaces.body.fields).toHaveProperty(field);
      expect(missing.status).toBe(400);
      expect(missing.body.fields).toHaveProperty(field);
      expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
    },
  );

  it.each(['not-an-email', 'ana@', '@walkthrough.test', 'ana lee@x.com'])(
    'marks an invalid email: %s (AC 22.3)',
    async (email) => {
      const res = await postOwner({...validOwner, email}, 'inspector');
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual({email: 'Enter a valid email'});
      expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
    },
  );

  it('refuses a password shorter than 8 characters (AC 22.4)', async () => {
    const res = await postOwner(
      {...validOwner, password: '1234567'},
      'inspector',
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Password must be at least 8 characters',
      fields: {password: 'Password must be at least 8 characters'},
    });
    expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
  });

  it('accepts a password of exactly 8 characters (AC 22.4)', async () => {
    const res = await postOwner(
      {...validOwner, password: '12345678'},
      'inspector',
    );
    expect(res.status).toBe(201);
  });

  it('refuses a missing password (AC 22.4)', async () => {
    const res = await postOwner(
      {...validOwner, password: undefined},
      'inspector',
    );
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('password');
  });

  it('refuses a store owner and creates nothing (AC 22.5)', async () => {
    const res = await postOwner(validOwner, 'ownerA');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(usersDb.findUserByEmail).not.toHaveBeenCalled();
    expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
  });

  it('refuses a store owner even when the body is invalid (AC 22.5)', async () => {
    const res = await postOwner({}, 'ownerB');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app)
      .post('/api/users/store-owners')
      .send(validOwner);
    expect(res.status).toBe(401);
    expect(usersDb.createStoreOwner).not.toHaveBeenCalled();
  });
});

describe('GET /api/users/store-owners', () => {
  it('lists the store owners for an inspector', async () => {
    vi.mocked(usersDb.listStoreOwners).mockResolvedValue([
      users.ownerA,
      users.ownerB,
    ]);
    const res = await request(app)
      .get('/api/users/store-owners')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([users.ownerA, users.ownerB]);
  });

  it('refuses a store owner', async () => {
    const res = await request(app)
      .get('/api/users/store-owners')
      .set(asUser('ownerA'));
    expect(res.status).toBe(403);
    expect(usersDb.listStoreOwners).not.toHaveBeenCalled();
  });
});
