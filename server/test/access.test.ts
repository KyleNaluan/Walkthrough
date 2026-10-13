import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as storesDb from '../src/db/stores.js';
import {
  assertInspectionAccess,
  assertStoreAccess,
  assertTicketAccess,
  storeIdsVisibleTo,
} from '../src/lib/access.js';
import {stores, users} from './helpers/users.js';

vi.mock('../src/db/stores.js');

// Inspection 10 is at store 1 (ownerA); ticket 30 is at store 3 (ownerB).
beforeEach(() => {
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(storesDb.storeIdForInspection).mockImplementation(async (id) =>
    id === 10 ? 1 : null,
  );
  vi.mocked(storesDb.storeIdForTicket).mockImplementation(async (id) =>
    id === 30 ? 3 : null,
  );
  vi.mocked(storesDb.listStoresByOwner).mockImplementation(async (ownerId) =>
    stores.filter((store) => store.ownerId === ownerId),
  );
});

describe('assertStoreAccess', () => {
  it('lets an inspector reach any store', async () => {
    await expect(assertStoreAccess(users.inspector, 3)).resolves.toMatchObject({
      id: 3,
    });
  });

  it('lets an owner reach their own store', async () => {
    await expect(assertStoreAccess(users.ownerA, 2)).resolves.toMatchObject({
      id: 2,
    });
  });

  it("refuses another owner's store with 403", async () => {
    await expect(assertStoreAccess(users.ownerA, 3)).rejects.toMatchObject({
      status: 403,
      message: 'Access denied',
    });
  });

  it('sends 404 for a store that does not exist', async () => {
    await expect(assertStoreAccess(users.inspector, 99)).rejects.toMatchObject({
      status: 404,
      message: 'Store not found',
    });
  });
});

describe('assertInspectionAccess', () => {
  it("follows the inspection back to its store's owner", async () => {
    await expect(
      assertInspectionAccess(users.ownerA, 10),
    ).resolves.toMatchObject({id: 1});
    await expect(
      assertInspectionAccess(users.ownerB, 10),
    ).rejects.toMatchObject({status: 403});
  });

  it('sends 404 for an inspection that does not exist', async () => {
    await expect(
      assertInspectionAccess(users.inspector, 99),
    ).rejects.toMatchObject({status: 404, message: 'Inspection not found'});
  });
});

describe('assertTicketAccess', () => {
  it("refuses a ticket at another owner's store with 403", async () => {
    await expect(assertTicketAccess(users.ownerA, 30)).rejects.toMatchObject({
      status: 403,
      message: 'Access denied',
    });
  });

  it("lets the ticket's store owner and inspectors through", async () => {
    await expect(assertTicketAccess(users.ownerB, 30)).resolves.toMatchObject({
      id: 3,
    });
    await expect(
      assertTicketAccess(users.inspector2, 30),
    ).resolves.toMatchObject({id: 3});
  });

  it('sends 404 for a ticket that does not exist', async () => {
    await expect(assertTicketAccess(users.inspector, 99)).rejects.toMatchObject(
      {status: 404, message: 'Ticket not found'},
    );
  });
});

describe('storeIdsVisibleTo', () => {
  it('is null (every store) for an inspector', async () => {
    await expect(storeIdsVisibleTo(users.inspector)).resolves.toBeNull();
  });

  it("is the owner's own store IDs for an owner", async () => {
    await expect(storeIdsVisibleTo(users.ownerA)).resolves.toEqual([1, 2]);
  });
});
