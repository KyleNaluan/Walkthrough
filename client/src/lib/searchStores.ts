import type {Store} from '../types';

/**
 * The stores whose name or address contains `query`, ignoring case and any
 * spaces around it (story 19). An empty or all-space query keeps every store.
 * It filters the list the server already sent, so an owner's search can only
 * ever find their own stores (AC 19.4).
 */
export function searchStores(stores: Store[], query: string): Store[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return stores;
  return stores.filter(
    (store) =>
      store.name.toLocaleLowerCase().includes(text) ||
      store.address.toLocaleLowerCase().includes(text),
  );
}
