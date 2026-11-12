import {describe, expect, it, vi} from 'vitest';
import {createStore, storeExists} from '../src/db/stores.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';

const OWNER_ID = '00000000-0000-4000-8000-00000000000a';

/**
 * A fake Supabase client for storeExists and createStore. `rows` is what the
 * storeExists query returns; `insertError` fails the insert.
 */
function fakeClient({
  rows = [],
  insertError = null,
}: {rows?: {store_id: number}[]; insertError?: unknown} = {}) {
  const calls = {regexIMatch: vi.fn(), limit: vi.fn(), insert: vi.fn()};
  const query = {
    regexIMatch: (column: string, pattern: string) => {
      calls.regexIMatch(column, pattern);
      return query;
    },
    limit: (count: number) => {
      calls.limit(count);
      return query;
    },
    overrideTypes: async () => ({data: rows, error: null}),
  };
  const client = {
    from: () => ({
      select: () => query,
      insert: (row: unknown) => {
        calls.insert(row);
        return {
          select: () => ({
            single: async () =>
              insertError
                ? {data: null, error: insertError}
                : {
                    data: {
                      store_id: 42,
                      name: 'Corner Deli',
                      address: '1 Main St',
                      owner_id: OWNER_ID,
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

describe('storeExists (story 23)', () => {
  it('storeExists matches name and address ignoring case (AC 23.2)', async () => {
    const calls = fakeClient({rows: [{store_id: 7}]});
    expect(await storeExists('corner deli', '1 MAIN ST')).toBe(true);
    expect(calls.regexIMatch).toHaveBeenCalledWith('name', '^corner deli$');
    expect(calls.regexIMatch).toHaveBeenCalledWith('address', '^1 MAIN ST$');
  });

  it('storeExists treats % _ and * literally (AC 23.2)', async () => {
    const calls = fakeClient();
    expect(await storeExists('Deli_50% Off*', '1 Main St.')).toBe(false);
    expect(calls.regexIMatch).toHaveBeenCalledWith('name', '^Deli_50% Off\\*$');
    expect(calls.regexIMatch).toHaveBeenCalledWith('address', '^1 Main St\\.$');
  });

  it('storeExists asks for one exact match, so a row limit cannot hide a duplicate (AC 23.2)', async () => {
    const calls = fakeClient({rows: [{store_id: 1002}]});
    expect(await storeExists('deli*', '1 Main St')).toBe(true);
    expect(calls.limit).toHaveBeenCalledWith(1);
  });

  it('storeExists is false for the same name at another address (AC 23.3)', async () => {
    const calls = fakeClient();
    expect(await storeExists('Corner Deli', '9 Oak Ave')).toBe(false);
    expect(calls.regexIMatch).toHaveBeenCalledWith('address', '^9 Oak Ave$');
  });
});

describe('createStore (story 23)', () => {
  it('createStore inserts the name, address and owner and returns the store (AC 23.1)', async () => {
    const calls = fakeClient();
    const store = await createStore({
      name: 'Corner Deli',
      address: '1 Main St',
      ownerId: OWNER_ID,
    });
    expect(calls.insert).toHaveBeenCalledWith({
      name: 'Corner Deli',
      address: '1 Main St',
      owner_id: OWNER_ID,
    });
    expect(store).toEqual({
      id: 42,
      name: 'Corner Deli',
      address: '1 Main St',
      ownerId: OWNER_ID,
    });
  });

  it('createStore turns a unique violation into the duplicate message (AC 23.2)', async () => {
    fakeClient({insertError: {code: '23505'}});
    await expect(
      createStore({
        name: 'Corner Deli',
        address: '1 Main St',
        ownerId: OWNER_ID,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'A store with this name and address already exists',
    });
  });
});
