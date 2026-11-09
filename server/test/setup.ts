import {vi} from 'vitest';
import {findUser, users, type UserKey} from './helpers/users.js';

// A token `test-<key>` (see asUser) belongs to that fixture user.
vi.mock('../src/lib/auth.js', () => ({
  verifyToken: vi.fn(async (token: string) => {
    const key = token.replace(/^test-/, '');
    return key in users ? users[key as UserKey].id : null;
  }),
  signIn: vi.fn(async () => null),
  signOut: vi.fn(async () => {}),
}));

// test/users-db.test.ts tests the real functions with vi.importActual.
vi.mock('../src/db/users.js', () => ({
  EMAIL_TAKEN: 'An account with this email already exists',
  getUserById: vi.fn(async (id: string) => findUser(id)),
  findUserByEmail: vi.fn(async () => null),
  listStoreOwners: vi.fn(async () => []),
  createStoreOwner: vi.fn(),
}));

// Tests never reach Supabase: mock the src/db/* module a route uses instead.
vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error('tests must mock the data layer');
  }),
}));
