import {Router} from 'express';
import {z} from 'zod';
import * as stores from '../db/stores.js';
import {assertStoreAccess} from '../lib/access.js';
import {idParam, parseParams} from '../lib/validate.js';
import {requireUser} from '../middleware/auth.js';

// Stories 2 and 3 (store list and store detail).
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
