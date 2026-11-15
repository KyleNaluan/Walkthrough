import type {ExtensionRequest, TicketDetail} from '../types';

/**
 * The ticket's extension request waiting for an inspector, if any. A
 * resolved ticket has none: resolving it closes the request (007).
 */
export function pendingExtension(
  ticket: TicketDetail,
): ExtensionRequest | undefined {
  if (ticket.status === 'resolved') return undefined;
  return ticket.extensionRequests.find((r) => r.status === 'pending');
}
