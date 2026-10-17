import {Router} from 'express';
import {z} from 'zod';
import * as inspections from '../db/inspections.js';
import * as stores from '../db/stores.js';
import {assertStoreAccess} from '../lib/access.js';
import {idParam, parseParams} from '../lib/validate.js';
import {requireUser} from '../middleware/auth.js';

// Stories 2, 3 and 14 (store list, store detail and inspection history).
export const storesRouter = Router();

const storeParams = z.object({storeId: idParam});

/** Every store for an inspector; only their own for an owner (AC 2.3). */
storesRouter.get('/stores', requireUser, async (req, res) => {
  const user = req.user!;
  res.json(
    user.role === 'inspector'
      ? await stores.listStores()
      : await stores.listStoresByOwner(user.id),
  );
});

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
