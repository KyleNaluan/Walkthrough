import type {ExtensionRequest, TicketDetail} from '../types';

/** The ticket's extension request waiting for an inspector, if any. */
export function pendingExtension(
  ticket: TicketDetail,
): ExtensionRequest | undefined {
  return ticket.extensionRequests.find((r) => r.status === 'pending');
}
