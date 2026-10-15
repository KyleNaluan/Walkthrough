import {Router} from 'express';
import {z} from 'zod';
import * as inspections from '../db/inspections.js';
import * as tickets from '../db/tickets.js';
import * as users from '../db/users.js';
import {assertInspectionAccess, assertStoreAccess} from '../lib/access.js';
import {
  deletePhoto,
  photoUpload,
  uploadPhoto,
  validatePhoto,
} from '../lib/photos.js';
import {
  idParam,
  nonBlank,
  notInPast,
  parseBody,
  parseParams,
} from '../lib/validate.js';
import {requireRole, requireUser} from '../middleware/auth.js';

// Stories 5 (start an inspection), 6 (record a finding) and 7 (finding photo).
export const inspectionsRouter = Router();

const storeParams = z.object({storeId: idParam});
const inspectionParams = z.object({inspectionId: idParam});
const findingBody = z.object({
  description: nonBlank('Description'),
  severity: z.enum(['low', 'medium', 'high'], 'Severity is required'),
  deadline: notInPast('Deadline'),
});

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
      tickets: await tickets.listTicketsForInspection(inspectionId),
    });
  },
);

// Every check runs before the photo is stored, so a refused finding leaves
// no file behind (AC 6.5, 6.8).
inspectionsRouter.post(
  '/inspections/:inspectionId/tickets',
  requireUser,
  requireRole('inspector'),
  photoUpload,
  async (req, res) => {
    const {inspectionId} = parseParams(inspectionParams, req);
    await assertInspectionAccess(req.user!, inspectionId);
    const finding = parseBody(findingBody, req);
    const photo = await uploadPhoto('tickets', await validatePhoto(req.file));
    try {
      const ticket = await tickets.createTicket(inspectionId, finding, photo);
      res.status(201).json(ticket);
    } catch (err) {
      await deletePhoto(photo);
      throw err;
    }
  },
);
