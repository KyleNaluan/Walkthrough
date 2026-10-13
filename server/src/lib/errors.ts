import type {NextFunction, Request, Response} from 'express';
import multer from 'multer';
import {ZodError} from 'zod';

/** An error with the HTTP status and message to send to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// Postgres error codes that Supabase passes through from a failed query.
const postgresErrors: Record<string, [number, string]> = {
  '23505': [409, 'Already exists'],
  '23503': [409, 'A linked record is missing or still in use'],
  '23514': [400, 'Invalid data'],
  '23502': [400, 'Invalid data'],
  '22P02': [400, 'Invalid ID'],
};

/** Maps a database error to an HttpError, or undefined if it isn't one. */
export function toHttpError(err: unknown): HttpError | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) {
    return undefined;
  }
  // A status step refused by database/002_status_functions.sql; its message
  // is written for the user.
  if (err.code === 'P0001' && 'message' in err) {
    return new HttpError(409, String(err.message));
  }
  const mapped =
    typeof err.code === 'string' ? postgresErrors[err.code] : undefined;
  return mapped && new HttpError(...mapped);
}

/**
 * The app's last middleware. Every error becomes `{error: message}`; a Zod
 * error also lists the failing fields so forms can mark them.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({error: err.message});
    return;
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      fields[issue.path.join('.')] ??= issue.message;
    }
    res.status(400).json({error: err.issues[0].message, fields});
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({error: 'Photo is too large'});
    } else {
      res.status(400).json({error: 'Invalid photo upload'});
    }
    return;
  }
  // express.json() rejects a malformed body with a 4xx status of its own.
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({error: 'Invalid JSON'});
    return;
  }
  const mapped = toHttpError(err);
  if (mapped) {
    res.status(mapped.status).json({error: mapped.message});
    return;
  }
  console.error(err);
  res.status(500).json({error: 'Internal server error'});
}
