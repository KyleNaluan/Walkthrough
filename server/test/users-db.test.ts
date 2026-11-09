import {AuthApiError} from '@supabase/supabase-js';
import {describe, expect, it, vi} from 'vitest';
import {getSupabaseAdmin} from '../src/lib/supabase.js';

// test/setup.ts mocks this module for the route tests; these test the real one.
const usersDb =
  await vi.importActual<typeof import('../src/db/users.js')>(
    '../src/db/users.js',
  );

const owner = {
  firstName: 'Ana',
  lastName: 'Lee',
  email: 'ana.lee@walkthrough.test',
  password: 'password123',
};
const NEW_ID = '00000000-0000-4000-8000-0000000000c1';

/**
 * A fake Supabase client for createStoreOwner. `createError` fails the Auth
 * step; `insertError` fails the app_user insert.
 */
function fakeClient({
  createError = null,
  insertError = null,
}: {createError?: unknown; insertError?: unknown} = {}) {
  const calls = {
    createUser: vi.fn(async () =>
      createError
        ? {data: {user: null}, error: createError}
        : {data: {user: {id: NEW_ID}}, error: null},
    ),
    deleteUser: vi.fn(async () => ({data: {}, error: null})),
    insert: vi.fn(),
  };
  const client = {
    auth: {
      admin: {createUser: calls.createUser, deleteUser: calls.deleteUser},
    },
    from: () => ({
      insert: (row: unknown) => {
        calls.insert(row);
        return {
          select: () => ({
            single: async () =>
              insertError
                ? {data: null, error: insertError}
                : {
                    data: {
                      user_id: NEW_ID,
                      first_name: 'Ana',
                      last_name: 'Lee',
                      email: owner.email,
                      role: 'store_owner',
                    },
                    error: null,
                  },
          }),
        };
      },
    }),
  };
  vi.mocked(getSupabaseAdmin).mockReturnValueOnce(
    client as unknown as ReturnType<typeof getSupabaseAdmin>,
  );
  return calls;
}

describe('createStoreOwner (story 22)', () => {
  it('creates a confirmed Auth user and a store_owner row (AC 22.1)', async () => {
    const calls = fakeClient();
    const user = await usersDb.createStoreOwner(owner);
    expect(calls.createUser).toHaveBeenCalledWith({
      email: owner.email,
      password: owner.password,
      email_confirm: true,
    });
    expect(calls.insert).toHaveBeenCalledWith({
      user_id: NEW_ID,
      first_name: 'Ana',
      last_name: 'Lee',
      email: owner.email,
      role: 'store_owner',
    });
    expect(user).toEqual({
      id: NEW_ID,
      firstName: 'Ana',
      lastName: 'Lee',
      email: owner.email,
      role: 'store_owner',
    });
  });

  it('answers 409 when Supabase Auth already has the email (AC 22.2)', async () => {
    const calls = fakeClient({
      createError: new AuthApiError('exists', 422, 'email_exists'),
    });
    await expect(usersDb.createStoreOwner(owner)).rejects.toMatchObject({
      status: 409,
      message: 'An account with this email already exists',
    });
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it('deletes the Auth user again when the row cannot be saved', async () => {
    const insertError = {code: '23503', message: 'insert failed'};
    const calls = fakeClient({insertError});
    await expect(usersDb.createStoreOwner(owner)).rejects.toBe(insertError);
    expect(calls.deleteUser).toHaveBeenCalledWith(NEW_ID);
  });

  it('answers 409 and cleans up when the email row already exists (AC 22.2)', async () => {
    const calls = fakeClient({insertError: {code: '23505'}});
    await expect(usersDb.createStoreOwner(owner)).rejects.toMatchObject({
      status: 409,
    });
    expect(calls.deleteUser).toHaveBeenCalledWith(NEW_ID);
  });
});
