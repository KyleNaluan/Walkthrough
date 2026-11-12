import {Router} from 'express';
import {z} from 'zod';
import * as inspections from '../db/inspections.js';
import * as stores from '../db/stores.js';
import * as users from '../db/users.js';
import {assertStoreAccess} from '../lib/access.js';
import {HttpError} from '../lib/errors.js';
import {idParam, nonBlank, parseBody, parseParams} from '../lib/validate.js';
import {requireRole, requireUser} from '../middleware/auth.js';

// Stories 2, 3, 14 and 23 (store list, store detail, inspection history and
// adding a store).
export const storesRouter = Router();

const OWNER_NOT_STORE_OWNER = 'Owner must be a store owner account';

const storeParams = z.object({storeId: idParam});

const newStoreBody = z.object({
  name: nonBlank('Name'),
  address: nonBlank('Address'),
  ownerId: nonBlank('Owner').pipe(z.guid(OWNER_NOT_STORE_OWNER)),
});

/** Every store for an inspector; only their own for an owner (AC 2.3). */
storesRouter.get('/stores', requireUser, async (req, res) => {
  const user = req.user!;
  res.json(
    user.role === 'inspector'
      ? await stores.listStores()
      : await stores.listStoresByOwner(user.id),
  );
});

// requireRole runs before the body is read, so a store owner is refused
// whatever they send (AC 23.6).
storesRouter.post(
  '/stores',
  requireUser,
  requireRole('inspector'),
  async (req, res) => {
    const store = parseBody(newStoreBody, req);
    const owner = await users.getUserById(store.ownerId);
    if (owner?.role !== 'store_owner') {
      throw new HttpError(400, OWNER_NOT_STORE_OWNER, {
        ownerId: OWNER_NOT_STORE_OWNER,
      });
    }
    if (await stores.storeExists(store.name, store.address)) {
      throw new HttpError(409, stores.STORE_TAKEN);
    }
    res.status(201).json(await stores.createStore(store));
  },
);

storesRouter.get('/stores/:storeId', requireUser, async (req, res) => {
  const {storeId} = parseParams(storeParams, req);
  res.json(await assertStoreAccess(req.user!, storeId));
});

/**
 * A store's inspections, newest first (AC 14.1). Inspectors see any store's,
 * owners only their own (AC 14.3, 14.4).
 */
storesRouter.get(
  '/stores/:storeId/inspections',
  requireUser,
  async (req, res) => {
    const {storeId} = parseParams(storeParams, req);
    await assertStoreAccess(req.user!, storeId);
    res.json(await inspections.listInspectionsForStore(storeId));
  },
);
