import type {Severity, TicketStatus} from './types';

/** Status names as the AC write them, with one colour each. */
export const TICKET_STATUS: Record<
  TicketStatus,
  {label: string; color: string}
> = {
  open: {label: 'Open', color: 'orange'},
  pending_review: {label: 'Pending review', color: 'navy'},
  changes_requested: {label: 'Changes requested', color: 'red'},
  reinspection_scheduled: {label: 'Re-inspection scheduled', color: 'grape'},
  resolved: {label: 'Resolved', color: 'green'},
};

export const SEVERITY: Record<Severity, {label: string; color: string}> = {
  low: {label: 'Low', color: 'yellow'},
  medium: {label: 'Medium', color: 'orange'},
  high: {label: 'High', color: 'red'},
};

/** A record number such as T-0007, as printed on an inspection form. */
export function recordNumber(prefix: string, id: number): string {
  return `${prefix}-${String(id).padStart(4, '0')}`;
}
