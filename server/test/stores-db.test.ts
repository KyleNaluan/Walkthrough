import {describe, expect, it, vi} from 'vitest';
import {createStore, storeExists} from '../src/db/stores.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';

const OWNER_ID = '00000000-0000-4000-8000-00000000000a';

/**
 * A fake Supabase client for storeExists and createStore. `rows` is what the
 * ilike query returns; `insertError` fails the insert.
 */
function fakeClient({
  rows = [],
  insertError = null,
}: {rows?: {name: string; address: string}[]; insertError?: unknown} = {}) {
  const calls = {ilike: vi.fn(), insert: vi.fn()};
  const query = {
    ilike: (column: string, pattern: string) => {
      calls.ilike(column, pattern);
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
    const calls = fakeClient({
      rows: [{name: 'Corner Deli', address: '1 Main St'}],
    });
    expect(await storeExists('corner deli', '1 MAIN ST')).toBe(true);
    expect(calls.ilike).toHaveBeenCalledWith('name', 'corner deli');
    expect(calls.ilike).toHaveBeenCalledWith('address', '1 MAIN ST');
  });

  it('storeExists treats % _ and * literally (AC 23.2)', async () => {
    const calls = fakeClient({
      rows: [{name: 'Deli 50% Off Today', address: '1 Main St'}],
    });
    expect(await storeExists('Deli_50% Off*', '1 Main St')).toBe(false);
    expect(calls.ilike).toHaveBeenCalledWith('name', 'Deli\\_50\\% Off*');
  });

  it('storeExists is false for the same name at another address (AC 23.3)', async () => {
    fakeClient({rows: [{name: 'Corner Deli', address: '1 Main St'}]});
    expect(await storeExists('Corner Deli', '9 Oak Ave')).toBe(false);
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
