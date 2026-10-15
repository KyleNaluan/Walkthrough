import {Router} from 'express';
import {z} from 'zod';
import * as inspections from '../db/inspections.js';
import * as users from '../db/users.js';
import {assertInspectionAccess, assertStoreAccess} from '../lib/access.js';
import {idParam, parseParams} from '../lib/validate.js';
import {requireRole, requireUser} from '../middleware/auth.js';

// Stories 5 (start an inspection), 6 (record a finding) and 7 (finding photo).
export const inspectionsRouter = Router();

const storeParams = z.object({storeId: idParam});
const inspectionParams = z.object({inspectionId: idParam});

// The inspector comes from the session, never the request body (AC 5.1).
inspectionsRouter.post(
  '/stores/:storeId/inspections',
  requireUser,
  requireRole('inspector'),
  async (req, res) => {
    const {storeId} = parseParams(storeParams, req);
    await assertStoreAccess(req.user!, storeId);
    const inspection = await inspections.createInspection(
      storeId,
      req.user!.id,
    );
    res.status(201).json(inspection);
  },
);

inspectionsRouter.get(
  '/inspections/:inspectionId',
  requireUser,
  async (req, res) => {
    const {inspectionId} = parseParams(inspectionParams, req);
    const store = await assertInspectionAccess(req.user!, inspectionId);
    const inspection = (await inspections.getInspection(inspectionId))!;
    const inspector = (await users.getUserById(inspection.inspectorId))!;
    res.json({
      ...inspection,
      store,
      inspector: {firstName: inspector.firstName, lastName: inspector.lastName},
    });
  },
);
