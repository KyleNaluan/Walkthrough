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
