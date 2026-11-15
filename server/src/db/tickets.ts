import {getSupabaseAdmin} from '../lib/supabase.js';
import type {
  ExtensionRequest,
  ExtensionStatus,
  FixSubmission,
  Reinspection,
  ReinspectionOutcome,
  ReviewDecision,
  Severity,
  Ticket,
  TicketDetail,
  TicketRow,
  TicketStatus,
  TicketSummary,
} from './types.js';

// The photo path stays on the server, so it is never selected here.
const ticketColumns =
  'ticket_id, description, severity, deadline, recorded_at, status, inspection_id';

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.ticket_id,
    description: row.description,
    severity: row.severity,
    deadline: row.deadline,
    recordedAt: row.recorded_at,
    status: row.status,
    inspectionId: row.inspection_id,
  };
}

/** Saves a finding as a new ticket; the database sets its status and time. */
export async function createTicket(
  inspectionId: number,
  finding: {description: string; severity: Severity; deadline: string},
  photo: string,
): Promise<Ticket> {
  const {data, error} = await getSupabaseAdmin()
    .from('ticket')
    .insert({
      inspection_id: inspectionId,
      description: finding.description,
      severity: finding.severity,
      deadline: finding.deadline,
      photo,
    })
    .select(ticketColumns)
    .single<TicketRow>();
  if (error) throw error;
  return toTicket(data);
}

/** A ticket's photo path in the photos bucket, or null if it doesn't exist. */
export async function getTicketPhoto(id: number): Promise<string | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('ticket')
    .select('photo')
    .eq('ticket_id', id)
    .maybeSingle<{photo: string}>();
  if (error) throw error;
  return data?.photo ?? null;
}

/** An inspection's tickets, in the order they were recorded. */
export async function listTicketsForInspection(
  inspectionId: number,
): Promise<Ticket[]> {
  const {data, error} = await getSupabaseAdmin()
    .from('ticket')
    .select(ticketColumns)
    .eq('inspection_id', inspectionId)
    .order('ticket_id')
    .overrideTypes<TicketRow[], {merge: false}>();
  if (error) throw error;
  return data.map(toTicket);
}

// Story 8: the ticket list -------------------------------------------------

/** A ticket list row as stored; the route works out whether it is overdue. */
export type TicketListRecord = Omit<TicketSummary, 'overdue'>;

interface TicketListRow {
  ticket_id: number;
  description: string;
  severity: Severity;
  deadline: string;
  status: TicketStatus;
  inspection: {store: {store_id: number; name: string}};
  reinspection: {
    reinspection_id: number;
    outcome: 'pending' | 'passed' | 'failed';
  }[];
}

/**
 * Tickets by deadline, earliest first (AC 8.3). `storeIds` limits them to
 * those stores, or null for every store; `status` keeps only that status.
 */
export async function listTickets({
  storeIds,
  status,
}: {
  storeIds: number[] | null;
  status?: TicketStatus;
}): Promise<TicketListRecord[]> {
  if (storeIds && storeIds.length === 0) return [];
  let query = getSupabaseAdmin()
    .from('ticket')
    .select(
      `ticket_id, description, severity, deadline, status,
       inspection!inner(store_id, store!inner(store_id, name)),
       reinspection(reinspection_id, outcome)`,
    );
  if (storeIds) query = query.in('inspection.store_id', storeIds);
  if (status) query = query.eq('status', status);
  const {data, error} = await query
    .order('deadline')
    .order('ticket_id')
    .overrideTypes<TicketListRow[], {merge: false}>();
  if (error) throw error;
  return data.map((row) => ({
    id: row.ticket_id,
    description: row.description,
    severity: row.severity,
    deadline: row.deadline,
    status: row.status,
    store: {
      id: row.inspection.store.store_id,
      name: row.inspection.store.name,
    },
    reinspectionId:
      row.reinspection.find((r) => r.outcome === 'pending')?.reinspection_id ??
      null,
  }));
}

// Story 9: a ticket's page and submitting a fix -------------------------------

/** A ticket as stored; the route works out whether it is overdue. */
export type TicketRecord = Omit<TicketDetail, 'overdue'>;

interface FixRow {
  fix_submission_id: number;
  description: string;
  submitted_at: string;
  review_decision: ReviewDecision | null;
  review_comment: string | null;
  reviewed_at: string | null;
  reviewer: {first_name: string; last_name: string} | null;
}

interface ReinspectionRow {
  reinspection_id: number;
  scheduled_for: string;
  outcome: ReinspectionOutcome;
  created_at: string;
  visit: {
    inspection_id: number;
    started_at: string;
    inspector: {first_name: string; last_name: string};
  } | null;
}

interface PersonRow {
  first_name: string;
  last_name: string;
}

interface ExtensionRequestRow {
  extension_request_id: number;
  previous_deadline: string;
  requested_deadline: string;
  reason: string;
  requested_at: string;
  status: ExtensionStatus;
  decision_comment: string | null;
  decided_at: string | null;
  requester: PersonRow;
  decider: PersonRow | null;
}

interface TicketDetailRow {
  ticket_id: number;
  description: string;
  severity: Severity;
  deadline: string;
  recorded_at: string;
  status: TicketStatus;
  inspection_id: number;
  inspection: {store: {store_id: number; name: string}};
  fix_submission: FixRow[];
  reinspection: ReinspectionRow[];
  extension_request: ExtensionRequestRow[];
}

const ticketDetailColumns = `
  ticket_id, description, severity, deadline, recorded_at, status,
  inspection_id,
  inspection!inner(store!inner(store_id, name)),
  fix_submission(
    fix_submission_id, description, submitted_at,
    review_decision, review_comment, reviewed_at,
    reviewer:app_user(first_name, last_name)
  ),
  reinspection(
    reinspection_id, scheduled_for, outcome, created_at,
    visit:inspection(
      inspection_id, started_at,
      inspector:app_user(first_name, last_name)
    )
  ),
  extension_request(
    extension_request_id, previous_deadline, requested_deadline, reason,
    requested_at, status, decision_comment, decided_at,
    requester:app_user!extension_request_requested_by_fkey(
      first_name, last_name
    ),
    decider:app_user!extension_request_decided_by_fkey(first_name, last_name)
  )`;

function toFix(row: FixRow): FixSubmission {
  // review_is_complete in 001_schema.sql: decision, time and reviewer are
  // set together.
  const reviewed = row.review_decision && row.reviewed_at && row.reviewer;
  return {
    id: row.fix_submission_id,
    description: row.description,
    submittedAt: row.submitted_at,
    review: reviewed
      ? {
          decision: row.review_decision!,
          comment: row.review_comment,
          reviewedAt: row.reviewed_at!,
          reviewerName: `${row.reviewer!.first_name} ${row.reviewer!.last_name}`,
        }
      : null,
  };
}

function toReinspection(row: ReinspectionRow): Reinspection {
  return {
    id: row.reinspection_id,
    scheduledFor: row.scheduled_for,
    outcome: row.outcome,
    createdAt: row.created_at,
    visit: row.visit && {
      inspectionId: row.visit.inspection_id,
      startedAt: row.visit.started_at,
      inspectorName: `${row.visit.inspector.first_name} ${row.visit.inspector.last_name}`,
    },
  };
}

function fullName(person: PersonRow): string {
  return `${person.first_name} ${person.last_name}`;
}

function toExtensionRequest(row: ExtensionRequestRow): ExtensionRequest {
  // decision_is_complete in 007_extension_requests.sql: an approved or
  // denied request has a decider and a time. A closed one has no decider.
  const decided =
    (row.status === 'approved' || row.status === 'denied') &&
    row.decided_at &&
    row.decider;
  return {
    id: row.extension_request_id,
    previousDeadline: row.previous_deadline,
    requestedDeadline: row.requested_deadline,
    reason: row.reason,
    requestedAt: row.requested_at,
    requesterName: fullName(row.requester),
    status: row.status,
    decision: decided
      ? {
          comment: row.decision_comment,
          decidedAt: row.decided_at!,
          deciderName: fullName(row.decider!),
        }
      : null,
  };
}

/**
 * One ticket with its store, fix rounds, re-inspections and extension
 * requests (each oldest first), or null.
 */
export async function getTicket(id: number): Promise<TicketRecord | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('ticket')
    .select(ticketDetailColumns)
    .eq('ticket_id', id)
    .maybeSingle<TicketDetailRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.ticket_id,
    description: data.description,
    severity: data.severity,
    deadline: data.deadline,
    recordedAt: data.recorded_at,
    status: data.status,
    inspectionId: data.inspection_id,
    store: {
      id: data.inspection.store.store_id,
      name: data.inspection.store.name,
    },
    fixes: [...data.fix_submission]
      .sort((a, b) => a.fix_submission_id - b.fix_submission_id)
      .map(toFix),
    reinspections: [...data.reinspection]
      .sort((a, b) => a.reinspection_id - b.reinspection_id)
      .map(toReinspection),
    extensionRequests: [...data.extension_request]
      .sort((a, b) => a.extension_request_id - b.extension_request_id)
      .map(toExtensionRequest),
  };
}

/** The storage path of a fix's photo if the fix is on this ticket, or null. */
export async function fixPhotoPath(
  ticketId: number,
  fixId: number,
): Promise<string | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('fix_submission')
    .select('photo')
    .eq('fix_submission_id', fixId)
    .eq('ticket_id', ticketId)
    .maybeSingle<{photo: string}>();
  if (error) throw error;
  return data?.photo ?? null;
}

/**
 * Saves a fix round and moves the ticket to pending_review in one step
 * (submit_fix in 002_status_functions.sql). A refusal is a P0001 error.
 */
export async function submitFix(
  ticketId: number,
  description: string,
  photoPath: string,
): Promise<number> {
  const {data, error} = await getSupabaseAdmin().rpc('submit_fix', {
    p_ticket_id: ticketId,
    p_description: description,
    p_photo: photoPath,
  });
  if (error) throw error;
  return data as number;
}

// Story 10: approve a fix ------------------------------------------------------

/** The ID of the ticket's newest fix round, or null if it has none. */
export async function latestFixId(ticketId: number): Promise<number | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('fix_submission')
    .select('fix_submission_id')
    .eq('ticket_id', ticketId)
    .order('fix_submission_id', {ascending: false})
    .limit(1)
    .maybeSingle<{fix_submission_id: number}>();
  if (error) throw error;
  return data?.fix_submission_id ?? null;
}

/**
 * Saves a review of a fix and moves the ticket on in one step (review_fix in
 * 002_status_functions.sql). A refusal is a P0001 error.
 */
export async function reviewFix(
  fixId: number,
  reviewerId: string,
  decision: ReviewDecision,
  comment: string | null,
): Promise<void> {
  const {error} = await getSupabaseAdmin().rpc('review_fix', {
    p_fix_id: fixId,
    p_reviewer_id: reviewerId,
    p_decision: decision,
    p_comment: comment,
  });
  if (error) throw error;
}

// Story 12: re-inspections ----------------------------------------------------

/**
 * Saves a review of a fix that schedules a re-inspection, and moves the
 * ticket on in one step (review_fix in 002_status_functions.sql). A refusal
 * is a P0001 error.
 */
export async function scheduleReinspection(
  fixId: number,
  reviewerId: string,
  comment: string | null,
  scheduledFor: string,
): Promise<void> {
  const {error} = await getSupabaseAdmin().rpc('review_fix', {
    p_fix_id: fixId,
    p_reviewer_id: reviewerId,
    p_decision: 'reinspection_scheduled',
    p_comment: comment,
    p_scheduled_for: scheduledFor,
  });
  if (error) throw error;
}

/**
 * Records a re-inspection as passed or failed and moves the ticket on in one
 * step (record_reinspection in 003_reinspection_result.sql). A refusal is a
 * P0001 error.
 */
export async function recordReinspection(
  ticketId: number,
  reinspectionId: number,
  inspectionId: number,
  outcome: 'passed' | 'failed',
): Promise<void> {
  const {error} = await getSupabaseAdmin().rpc('record_reinspection', {
    p_ticket_id: ticketId,
    p_reinspection_id: reinspectionId,
    p_inspection_id: inspectionId,
    p_outcome: outcome,
  });
  if (error) throw error;
}

// Story 17: request a deadline extension ---------------------------------------

/**
 * Saves a pending request for a later deadline (request_extension in
 * 007_extension_requests.sql), which checks the ticket again under a lock.
 * A refusal is a P0001 error.
 */
export async function requestExtension(
  ticketId: number,
  ownerId: string,
  deadline: string,
  reason: string,
): Promise<number> {
  const {data, error} = await getSupabaseAdmin().rpc('request_extension', {
    p_ticket_id: ticketId,
    p_owner_id: ownerId,
    p_deadline: deadline,
    p_reason: reason,
  });
  if (error) throw error;
  return data as number;
}

// Story 18: decide an extension request ----------------------------------------

/**
 * Approves a pending request, which moves the ticket's deadline to the
 * requested date, or denies it with a comment, in one step (decide_extension
 * in 007_extension_requests.sql). A refusal is a P0001 error.
 */
export async function decideExtension(
  requestId: number,
  inspectorId: string,
  decision: 'approved' | 'denied',
  comment: string | null,
): Promise<void> {
  const {error} = await getSupabaseAdmin().rpc('decide_extension', {
    p_request_id: requestId,
    p_inspector_id: inspectorId,
    p_decision: decision,
    p_comment: comment,
  });
  if (error) throw error;
}
