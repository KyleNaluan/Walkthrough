import type {NextFunction, Request, RequestHandler, Response} from 'express';
import * as users from '../db/users.js';
import type {UserRole} from '../db/types.js';
import {verifyToken} from '../lib/auth.js';
import {HttpError} from '../lib/errors.js';
// Adds req.user; also pulls the declaration into `tsc -p api`.
import type {} from '../types/express.js';

/** The token from the `Authorization: Bearer` header, if any. */
export function bearerToken(req: Request): string | undefined {
  return /^Bearer (.+)$/i.exec(req.get('Authorization') ?? '')?.[1];
}

/** Sets req.user from the `Authorization: Bearer` token, or sends a 401. */
export async function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req);
  const userId = token ? await verifyToken(token) : null;
  const user = userId ? await users.getUserById(userId) : null;
  if (!user) throw new HttpError(401, 'Not logged in');
  req.user = user;
  next();
}

/** Sends a 403 unless req.user has one of the roles. Use after requireUser. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'Not logged in');
    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, 'Access denied');
    }
    next();
  };
}
