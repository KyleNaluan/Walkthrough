import {getSupabaseAdmin} from '../lib/supabase.js';
import type {Severity, Ticket, TicketRow} from './types.js';

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
