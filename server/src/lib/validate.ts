import type {Request} from 'express';
import {z} from 'zod';
import type {TicketStatus} from '../db/types.js';

/** The time zone that decides "today" for deadlines and overdue tickets. */
export const TIME_ZONE = 'America/Chicago';

/** Parses the request body, throwing a ZodError (sent as a 400) if invalid. */
export function parseBody<T extends z.ZodType>(
  schema: T,
  req: Request,
): z.infer<T> {
  return schema.parse(req.body);
}

/** Parses the URL params, throwing a ZodError (sent as a 400) if invalid. */
export function parseParams<T extends z.ZodType>(
  schema: T,
  req: Request,
): z.infer<T> {
  return schema.parse(req.params);
}

/** A positive whole-number ID taken from a URL segment. */
export const idParam = z.coerce
  .number('Invalid ID')
  .int('Invalid ID')
  .positive('Invalid ID');

/** A required text field that may not be empty or only spaces. Trimmed. */
export function nonBlank(field: string) {
  const message = `${field} is required`;
  return z.string(message).trim().min(1, message);
}

/** Today's date as YYYY-MM-DD in TIME_ZONE, not the server's clock. */
export function today(): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** A YYYY-MM-DD date that is today or later. */
export function notInPast(field: string) {
  return z.iso
    .date(`${field} must be a date`)
    .refine((date) => date >= today(), `${field} cannot be in the past`);
}

/** True when the deadline has passed and the ticket isn't resolved. */
export function isOverdue(deadline: string, status: TicketStatus): boolean {
  return deadline < today() && status !== 'resolved';
}
