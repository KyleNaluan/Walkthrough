// Value lists from database/001_schema.sql.
export type UserRole = 'inspector' | 'store_owner';
export type Severity = 'low' | 'medium' | 'high';
export type TicketStatus =
  | 'open'
  | 'pending_review'
  | 'changes_requested'
  | 'reinspection_scheduled'
  | 'resolved';
export type ReviewDecision =
  'approved' | 'changes_requested' | 'reinspection_scheduled';
export type ReinspectionOutcome = 'pending' | 'passed' | 'failed';

// Rows as Supabase returns them.
export interface AppUserRow {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
}

export interface StoreRow {
  store_id: number;
  name: string;
  address: string;
  owner_id: string;
}

export interface InspectionRow {
  inspection_id: number;
  started_at: string;
  store_id: number;
  inspector_id: string;
}

export interface TicketRow {
  ticket_id: number;
  description: string;
  severity: Severity;
  deadline: string;
  recorded_at: string;
  status: TicketStatus;
  inspection_id: number;
}

// The camelCase objects the rest of the server uses.
export interface AppUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
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
 * A row of the ticket list (story 8), with the ID of the re-inspection
 * waiting for a result, if any (story 12).
 */
export interface TicketSummary {
  id: number;
  description: string;
  severity: Severity;
  deadline: string;
  status: TicketStatus;
  overdue: boolean;
  store: {id: number; name: string};
  reinspectionId: number | null;
}

/** An inspector's decision on one fix round. Photo paths are never sent. */
export interface FixReview {
  decision: ReviewDecision;
  comment: string | null;
  reviewedAt: string;
  reviewerName: string;
}

/** One fix round: what the owner sent and, once reviewed, the review. */
export interface FixSubmission {
  id: number;
  description: string;
  submittedAt: string;
  review: FixReview | null;
}

/** A ticket with its store and every fix round, oldest first. */
export interface TicketDetail {
  id: number;
  description: string;
  severity: Severity;
  deadline: string;
  recordedAt: string;
  status: TicketStatus;
  overdue: boolean;
  inspectionId: number;
  store: {id: number; name: string};
  fixes: FixSubmission[];
}
