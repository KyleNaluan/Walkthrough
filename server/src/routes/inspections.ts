import {Router} from 'express';
import {z} from 'zod';
import * as checklist from '../db/checklist.js';
import * as inspections from '../db/inspections.js';
import * as tickets from '../db/tickets.js';
import type {Store} from '../db/types.js';
import * as users from '../db/users.js';
import {
  assertInspectionAccess,
  assertStoreAccess,
  assertTicketAccess,
} from '../lib/access.js';
import {HttpError} from '../lib/errors.js';
import {
  deletePhoto,
  photoUpload,
  signedPhotoUrl,
  uploadPhoto,
  validatePhoto,
} from '../lib/photos.js';
import {
  idField,
  idParam,
  nonBlank,
  notInPast,
  parseBody,
  parseParams,
} from '../lib/validate.js';
import {requireRole, requireUser} from '../middleware/auth.js';

// Stories 5 (start an inspection), 6 (record a finding), 7 (finding photo),
// 15 (inspection checklist) and 16 (complete an inspection).
export const inspectionsRouter = Router();

const storeParams = z.object({storeId: idParam});
const inspectionParams = z.object({inspectionId: idParam});
const ticketParams = z.object({ticketId: idParam});
const findingBody = z.object({
  description: nonBlank('Description'),
  severity: z.enum(['low', 'medium', 'high'], 'Severity is required'),
  deadline: notInPast('Deadline'),
});
const checklistParams = z.object({inspectionId: idParam, itemId: idParam});
const answerBody = z.object({
  answer: z.enum(['pass', 'fail', 'na'], 'Answer must be Pass, Fail or N/A'),
  ticketId: idField.nullish(),
});

const FINDING_REQUIRED = 'Record a finding for a failed item';
const ALREADY_COMPLETED = 'This inspection is already completed';

/**
 * An inspection with its store, inspector and findings, and once completed
 * its summary (AC 16.1).
 */
async function inspectionDetail(store: Store, inspectionId: number) {
  const inspection = (await inspections.getInspection(inspectionId))!;
  const inspector = (await users.getUserById(inspection.inspectorId))!;
  return {
    ...inspection,
    store,
    inspector: {firstName: inspector.firstName, lastName: inspector.lastName},
    tickets: await tickets.listTicketsForInspection(inspectionId),
    summary: inspection.completedAt
      ? checklist.summarize(await checklist.listChecklist(inspectionId))
      : null,
  };
}

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
    res.json(await inspectionDetail(store, inspectionId));
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

// Access is checked before the photo path is read, so a refused request gets
// no photo or link (AC 7.3). The link expires after 5 minutes (AC 7.4).
inspectionsRouter.get(
  '/tickets/:ticketId/photo',
  requireUser,
  async (req, res) => {
    const {ticketId} = parseParams(ticketParams, req);
    await assertTicketAccess(req.user!, ticketId);
    const path = await tickets.getTicketPhoto(ticketId);
    if (!path) throw new HttpError(404, 'Photo not found');
    res.json({url: await signedPhotoUrl(path)});
  },
);

inspectionsRouter.get(
  '/inspections/:inspectionId/checklist',
  requireUser,
  async (req, res) => {
    const {inspectionId} = parseParams(inspectionParams, req);
    await assertInspectionAccess(req.user!, inspectionId);
    res.json(await checklist.listChecklist(inspectionId));
  },
);

// requireRole runs before the params or body are read, so a store owner is
// refused whatever they send (AC 15.4). Every check runs before the answer
// is saved, so a refused answer saves nothing.
inspectionsRouter.put(
  '/inspections/:inspectionId/checklist/:itemId',
  requireUser,
  requireRole('inspector'),
  async (req, res) => {
    const {inspectionId, itemId} = parseParams(checklistParams, req);
    await assertInspectionAccess(req.user!, inspectionId);
    const {answer, ticketId} = parseBody(answerBody, req);
    const item = (await checklist.listChecklist(inspectionId)).find(
      (entry) => entry.id === itemId,
    );
    if (!item) throw new HttpError(404, 'Checklist item not found');
    if (answer === 'fail') {
      // A missing finding and one from another inspection are both refused
      // (AC 15.2).
      const findings = await tickets.listTicketsForInspection(inspectionId);
      if (!findings.some((ticket) => ticket.id === ticketId)) {
        throw new HttpError(400, FINDING_REQUIRED, {
          ticketId: FINDING_REQUIRED,
        });
      }
    }
    // Only a failed item keeps a finding (fail_needs_finding in
    // 004_checklist.sql).
    const saved = {
      ...item,
      answer,
      ticketId: answer === 'fail' ? ticketId! : null,
    };
    await checklist.saveAnswer(inspectionId, itemId, answer, saved.ticketId);
    res.json(saved);
  },
);

// Every item must be answered (AC 16.2), and the completion time is set only
// once, so a second complete is refused and keeps the first time (AC 16.3).
inspectionsRouter.post(
  '/inspections/:inspectionId/complete',
  requireUser,
  requireRole('inspector'),
  async (req, res) => {
    const {inspectionId} = parseParams(inspectionParams, req);
    const store = await assertInspectionAccess(req.user!, inspectionId);
    const inspection = (await inspections.getInspection(inspectionId))!;
    if (inspection.completedAt) throw new HttpError(409, ALREADY_COMPLETED);
    const entries = await checklist.listChecklist(inspectionId);
    if (entries.some((entry) => entry.answer === null)) {
      throw new HttpError(409, 'Answer every checklist item first');
    }
    // Null if another request completed it since the check above.
    if (!(await inspections.completeInspection(inspectionId))) {
      throw new HttpError(409, ALREADY_COMPLETED);
    }
    res.json(await inspectionDetail(store, inspectionId));
  },
);
