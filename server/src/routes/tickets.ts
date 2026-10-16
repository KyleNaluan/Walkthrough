import {Router} from 'express';
import {z} from 'zod';
import * as tickets from '../db/tickets.js';
import type {TicketStatus} from '../db/types.js';
import {storeIdsVisibleTo} from '../lib/access.js';
import {isOverdue} from '../lib/validate.js';
import {requireUser} from '../middleware/auth.js';

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
