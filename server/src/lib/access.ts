import * as stores from '../db/stores.js';
import type {AppUser, Store} from '../db/types.js';
import {HttpError} from './errors.js';

/**
 * Returns the store if the user may see it: inspectors see every store,
 * owners only their own. Throws 404 if it doesn't exist, 403 otherwise.
 */
export async function assertStoreAccess(
  user: AppUser,
  storeId: number,
): Promise<Store> {
  const store = await stores.getStore(storeId);
  if (!store) throw new HttpError(404, 'Store not found');
  if (user.role !== 'inspector' && store.ownerId !== user.id) {
    throw new HttpError(403, 'Access denied');
  }
  return store;
}

/** assertStoreAccess for the store an inspection belongs to. */
export async function assertInspectionAccess(
  user: AppUser,
  inspectionId: number,
): Promise<Store> {
  const storeId = await stores.storeIdForInspection(inspectionId);
  if (storeId == null) throw new HttpError(404, 'Inspection not found');
  return assertStoreAccess(user, storeId);
}

/** assertStoreAccess for the store a ticket belongs to. */
export async function assertTicketAccess(
  user: AppUser,
  ticketId: number,
): Promise<Store> {
  const storeId = await stores.storeIdForTicket(ticketId);
  if (storeId == null) throw new HttpError(404, 'Ticket not found');
  return assertStoreAccess(user, storeId);
}

/** The IDs of the stores a user may see, or null for all (inspectors). */
export async function storeIdsVisibleTo(
  user: AppUser,
): Promise<number[] | null> {
  if (user.role === 'inspector') return null;
  const owned = await stores.listStoresByOwner(user.id);
  return owned.map((store) => store.id);
}
