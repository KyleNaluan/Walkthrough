import {Router, type NextFunction, type Request, type Response} from 'express';
import {z} from 'zod';
import * as tickets from '../db/tickets.js';
import type {AppUser, TicketDetail, TicketStatus} from '../db/types.js';
import {
  assertStoreAccess,
  assertTicketAccess,
  storeIdsVisibleTo,
} from '../lib/access.js';
import {HttpError} from '../lib/errors.js';
import {
  deletePhoto,
  photoUpload,
  signedPhotoUrl,
  uploadPhoto,
  validatePhoto,
  type ValidPhoto,
} from '../lib/photos.js';
import {idParam, isOverdue, parseBody, parseParams} from '../lib/validate.js';
import {requireRole, requireUser} from '../middleware/auth.js';

// Stories 8-11 (ticket list, submit a fix, approve, request changes).
export const ticketsRouter = Router();

// Story 8: the ticket list ----------------------------------------------------

const TICKET_STATUSES = [
  'open',
  'pending_review',
  'changes_requested',
  'reinspection_scheduled',
  'resolved',
] as const satisfies readonly TicketStatus[];

const listQuery = z.object({
  status: z.enum(TICKET_STATUSES, 'Unknown status').optional(),
});

/**
 * Every ticket for an inspector, only their stores' for an owner (AC 8.1,
 * 8.2), earliest deadline first (AC 8.3), optionally one status (AC 8.4).
 */
ticketsRouter.get('/tickets', requireUser, async (req, res) => {
  const {status} = listQuery.parse(req.query);
  const storeIds = await storeIdsVisibleTo(req.user!);
  const rows = await tickets.listTickets({storeIds, status});
  res.json(
    rows.map((row) => ({
      ...row,
      overdue: isOverdue(row.deadline, row.status), // AC 8.5, 8.6
    })),
  );
});

// Story 9: a ticket's page ----------------------------------------------------
// The finding's own photo is GET /tickets/:ticketId/photo in inspections.ts
// (story 7).

const ticketParams = z.object({ticketId: idParam});
const fixPhotoParams = z.object({ticketId: idParam, fixId: idParam});

const NOT_WAITING_FOR_FIX = 'This ticket is not waiting for a fix';

/** A ticket the user may see: 404 if it doesn't exist, 403 if not theirs. */
async function loadTicket(
  user: AppUser,
  ticketId: number,
): Promise<tickets.TicketRecord> {
  const ticket = await tickets.getTicket(ticketId);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  await assertStoreAccess(user, ticket.store.id);
  return ticket;
}

function withOverdue(ticket: tickets.TicketRecord): TicketDetail {
  return {...ticket, overdue: isOverdue(ticket.deadline, ticket.status)};
}

/** The ticket again after a change, as the page shows it. */
async function reloadTicket(ticketId: number): Promise<TicketDetail> {
  const ticket = await tickets.getTicket(ticketId);
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  return withOverdue(ticket);
}

ticketsRouter.get('/tickets/:ticketId', requireUser, async (req, res) => {
  const {ticketId} = parseParams(ticketParams, req);
  res.json(withOverdue(await loadTicket(req.user!, ticketId)));
});

ticketsRouter.get(
  '/tickets/:ticketId/fixes/:fixId/photo',
  requireUser,
  async (req, res) => {
    const {ticketId, fixId} = parseParams(fixPhotoParams, req);
    await assertTicketAccess(req.user!, ticketId);
    const path = await tickets.fixPhotoPath(ticketId, fixId);
    if (!path) throw new HttpError(404, 'Photo not found');
    res.json({url: await signedPhotoUrl(path)});
  },
);

// Story 9: submit a fix ------------------------------------------------------

/**
 * Runs before the upload is read, so a refused request (AC 9.3, 9.5) never
 * gets as far as storing a photo. submit_fix checks the status again under a
 * lock, in case it changes in between.
 */
async function canSubmitFix(req: Request, _res: Response, next: NextFunction) {
  const {ticketId} = parseParams(ticketParams, req);
  const ticket = await loadTicket(req.user!, ticketId);
  if (ticket.status !== 'open' && ticket.status !== 'changes_requested') {
    throw new HttpError(409, NOT_WAITING_FOR_FIX);
  }
  next();
}

/** Checks both fields at once so the form can mark every problem (AC 9.4). */
async function parseFix(
  req: Request,
): Promise<{description: string; photo: ValidPhoto}> {
  const raw: unknown = req.body?.description;
  const description = typeof raw === 'string' ? raw.trim() : '';
  const fields: Record<string, string> = {};
  if (!description) fields.description = 'Description is required';

  let photo: ValidPhoto | undefined;
  try {
    photo = await validatePhoto(req.file);
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    fields.photo = err.message;
  }

  const messages = Object.values(fields);
  if (messages.length > 0) throw new HttpError(400, messages[0], fields);
  return {description, photo: photo!};
}

ticketsRouter.post(
  '/tickets/:ticketId/fixes',
  requireUser,
  requireRole('store_owner'), // AC 9.6
  canSubmitFix,
  photoUpload,
  async (req, res) => {
    const {ticketId} = parseParams(ticketParams, req);
    const {description, photo} = await parseFix(req);
    const path = await uploadPhoto('fixes', photo);
    try {
      await tickets.submitFix(ticketId, description, path);
    } catch (err) {
      // Nothing was saved, so the photo would be left with no fix.
      await deletePhoto(path);
      throw err;
    }
    res.status(201).json(await reloadTicket(ticketId));
  },
);

// Stories 10 and 11: approve or request changes ------------------------------

const NOTHING_TO_REVIEW = 'This ticket has no fix waiting for review';
const COMMENT_REQUIRED = 'A comment is required to request changes';

const reviewBody = z.object({
  decision: z.enum(
    ['approved', 'changes_requested'],
    'Decision must be approved or changes_requested',
  ),
  comment: z.string('Comment must be text').trim().optional(),
});

ticketsRouter.post(
  '/tickets/:ticketId/review',
  requireUser,
  requireRole('inspector'), // AC 10.3
  async (req, res) => {
    const {ticketId} = parseParams(ticketParams, req);
    const {decision, comment} = parseBody(reviewBody, req);
    if (decision === 'changes_requested' && !comment) {
      throw new HttpError(400, COMMENT_REQUIRED, {comment: COMMENT_REQUIRED}); // AC 11.2
    }

    const ticket = await loadTicket(req.user!, ticketId);
    const fixId = await tickets.latestFixId(ticketId);
    if (ticket.status !== 'pending_review' || fixId == null) {
      throw new HttpError(409, NOTHING_TO_REVIEW); // AC 10.2
    }
    // review_fix records the reviewer and time, and checks the status again
    // (AC 10.1, 11.1).
    await tickets.reviewFix(fixId, req.user!.id, decision, comment || null);
    res.json(await reloadTicket(ticketId));
  },
);
