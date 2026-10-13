import {getSupabaseAdmin} from '../lib/supabase.js';
import type {Store, StoreRow} from './types.js';

const storeColumns = 'store_id, name, address, owner_id';

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
