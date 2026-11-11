import {HttpError} from '../lib/errors.js';
import {getSupabaseAdmin} from '../lib/supabase.js';
import type {Store, StoreRow} from './types.js';

const storeColumns = 'store_id, name, address, owner_id';

/** The message for a store that is already in the list (AC 23.2). */
export const STORE_TAKEN = 'A store with this name and address already exists';

function toStore(row: StoreRow): Store {
  return {
    id: row.store_id,
    name: row.name,
    address: row.address,
    ownerId: row.owner_id,
  };
}

/** One store, or null if it doesn't exist. */
export async function getStore(id: number): Promise<Store | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('store')
    .select(storeColumns)
    .eq('store_id', id)
    .maybeSingle<StoreRow>();
  if (error) throw error;
  return data && toStore(data);
}

/** Every store, by name. */
export async function listStores(): Promise<Store[]> {
  const {data, error} = await getSupabaseAdmin()
    .from('store')
    .select(storeColumns)
    .order('name')
    .overrideTypes<StoreRow[], {merge: false}>();
  if (error) throw error;
  return data.map(toStore);
}

/** The stores one owner owns, by name. */
export async function listStoresByOwner(ownerId: string): Promise<Store[]> {
  const {data, error} = await getSupabaseAdmin()
    .from('store')
    .select(storeColumns)
    .eq('owner_id', ownerId)
    .order('name')
    .overrideTypes<StoreRow[], {merge: false}>();
  if (error) throw error;
  return data.map(toStore);
}

/** A regex that matches exactly this text, with no wildcards. */
function exactly(text: string): string {
  return `^${text.replace(/[\\^$.|?*+()[\]{}]/g, (char) => `\\${char}`)}$`;
}

/** True if a store has this name and address, ignoring case (AC 23.2). */
export async function storeExists(
  name: string,
  address: string,
): Promise<boolean> {
  // ~* ignores case. Unlike ilike, it has no * wildcard that could widen the
  // query past PostgREST's row limit, so one row is enough.
  const {data, error} = await getSupabaseAdmin()
    .from('store')
    .select('store_id')
    .regexIMatch('name', exactly(name))
    .regexIMatch('address', exactly(address))
    .limit(1)
    .overrideTypes<{store_id: number}[], {merge: false}>();
  if (error) throw error;
  return data.length > 0;
}

export interface NewStore {
  name: string;
  address: string;
  ownerId: string;
}

/**
 * Saves a new store (story 23). The (name, address) unique constraint
 * catches a duplicate that slips past storeExists.
 */
export async function createStore(store: NewStore): Promise<Store> {
  const {data, error} = await getSupabaseAdmin()
    .from('store')
    .insert({
      name: store.name,
      address: store.address,
      owner_id: store.ownerId,
    })
    .select(storeColumns)
    .single<StoreRow>();
  if (error) {
    if (error.code === '23505') throw new HttpError(409, STORE_TAKEN);
    throw error;
  }
  return toStore(data);
}

/** The store an inspection belongs to, or null if it doesn't exist. */
export async function storeIdForInspection(id: number): Promise<number | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('inspection')
    .select('store_id')
    .eq('inspection_id', id)
    .maybeSingle<{store_id: number}>();
  if (error) throw error;
  return data?.store_id ?? null;
}

/** The store a ticket belongs to, through its inspection, or null. */
export async function storeIdForTicket(id: number): Promise<number | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('ticket')
    .select('inspection!inner(store_id)')
    .eq('ticket_id', id)
    .maybeSingle<{inspection: {store_id: number}}>();
  if (error) throw error;
  return data?.inspection.store_id ?? null;
}
