import {vi} from 'vitest';
import {findUser, users, type UserKey} from './helpers/users.js';

// A token `test-<key>` (see asUser) belongs to that fixture user.
vi.mock('../src/lib/auth.js', () => ({
  verifyToken: vi.fn(async (token: string) => {
    const key = token.replace(/^test-/, '');
    return key in users ? users[key as UserKey].id : null;
  }),
  signIn: vi.fn(async () => null),
}));

vi.mock('../src/db/users.js', () => ({
  getUserById: vi.fn(async (id: string) => findUser(id)),
}));

// Tests never reach Supabase: mock the src/db/* module a route uses instead.
vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseAdmin: vi.fn(() => {
    throw new Error('tests must mock the data layer');
  }),
}));
