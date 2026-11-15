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
// From database/004_checklist.sql.
export type ChecklistAnswer = 'pass' | 'fail' | 'na';
// From database/007_extension_requests.sql.
// closed: the ticket was resolved before an inspector decided.
export type ExtensionStatus = 'pending' | 'approved' | 'denied' | 'closed';

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
  completed_at: string | null;
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
  completedAt: string | null;
}

/** A row of a store's inspection history (story 14). */
export interface InspectionSummary {
  id: number;
  startedAt: string;
  inspector: {firstName: string; lastName: string};
  findingCount: number;
  completedAt: string | null;
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

/** A re-inspection; `visit` stays null until its result is recorded. */
export interface Reinspection {
  id: number;
  scheduledFor: string;
  outcome: ReinspectionOutcome;
  createdAt: string;
  visit: {
    inspectionId: number;
    startedAt: string;
    inspectorName: string;
  } | null;
}

/** An inspector's decision on an extension request (story 18). */
export interface ExtensionDecision {
  comment: string | null;
  decidedAt: string;
  deciderName: string;
}

/**
 * An owner's request for a later deadline (story 17). `previousDeadline` is
 * the deadline when they asked; `decision` stays null while it is pending,
 * and for a request closed because the ticket was resolved.
 */
export interface ExtensionRequest {
  id: number;
  previousDeadline: string;
  requestedDeadline: string;
  reason: string;
  requestedAt: string;
  requesterName: string;
  status: ExtensionStatus;
  decision: ExtensionDecision | null;
}

/**
 * A ticket with its store, every fix round, every re-inspection and every
 * extension request, oldest first.
 */
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
  reinspections: Reinspection[];
  extensionRequests: ExtensionRequest[];
}

/**
 * A checklist item with an inspection's answer, or null if not answered yet;
 * `ticketId` is the finding a failed item is for (story 15).
 */
export interface ChecklistEntry {
  id: number;
  text: string;
  answer: ChecklistAnswer | null;
  ticketId: number | null;
}

/** How many items a completed inspection passed, failed and marked N/A. */
export type ChecklistSummary = Record<ChecklistAnswer, number>;
