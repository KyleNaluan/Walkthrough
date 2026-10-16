import {getSupabaseAdmin} from '../lib/supabase.js';
import type {
  FixSubmission,
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
       inspection!inner(store_id, store!inner(store_id, name))`,
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
}

const ticketDetailColumns = `
  ticket_id, description, severity, deadline, recorded_at, status,
  inspection_id,
  inspection!inner(store!inner(store_id, name)),
  fix_submission(
    fix_submission_id, description, submitted_at,
    review_decision, review_comment, reviewed_at,
    reviewer:app_user(first_name, last_name)
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

/** One ticket with its store and fix rounds (oldest first), or null. */
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
