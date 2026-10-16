// Shapes the API sends; they match server/src/db/types.ts.
export type Role = 'inspector' | 'store_owner';
export type Severity = 'low' | 'medium' | 'high';
export type TicketStatus =
  | 'open'
  | 'pending_review'
  | 'changes_requested'
  | 'reinspection_scheduled'
  | 'resolved';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

export interface Store {
  id: number;
  name: string;
  address: string;
  ownerId: string;
}

export interface Inspection {
  id: number;
  startedAt: string;
  storeId: number;
  inspectorId: string;
}

export interface Ticket {
  id: number;
  description: string;
  severity: Severity;
  deadline: string;
  recordedAt: string;
  status: TicketStatus;
  inspectionId: number;
}

/**
 * An inspection with its store, inspector and findings, from
 * GET /api/inspections/:id.
 */
export interface InspectionDetail extends Inspection {
  store: Store;
  inspector: {firstName: string; lastName: string};
  tickets: Ticket[];
}

/** A row of the ticket list (story 8). */
export interface TicketSummary {
  id: number;
  description: string;
  severity: Severity;
  deadline: string;
  status: TicketStatus;
  overdue: boolean;
  store: {id: number; name: string};
}
