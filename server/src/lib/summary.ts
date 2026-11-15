import type {TicketStatus} from '../db/types.js';
import {isOverdue} from './validate.js';

/** A store's standing at a glance (story 20). */
export interface StoreSummary {
  /** Tickets that are not resolved, whatever step they are at. */
  openTickets: number;
  /** Open tickets whose deadline has passed, as the ticket list counts them. */
  overdueTickets: number;
  /** The most recently started inspection, or null if there has been none. */
  lastInspection: {
    id: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
}

/** Counts a store's tickets and finds its latest inspection. */
export function summarizeStore(
  tickets: {status: TicketStatus; deadline: string}[],
  inspections: {id: number; startedAt: string; completedAt: string | null}[],
): StoreSummary {
  let latest: StoreSummary['lastInspection'] = null;
  for (const {id, startedAt, completedAt} of inspections) {
    if (!latest || startedAt > latest.startedAt) {
      latest = {id, startedAt, completedAt};
    }
  }
  return {
    openTickets: tickets.filter((ticket) => ticket.status !== 'resolved')
      .length,
    overdueTickets: tickets.filter((ticket) =>
      isOverdue(ticket.deadline, ticket.status),
    ).length,
    lastInspection: latest,
  };
}
