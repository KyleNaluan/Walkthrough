import {Router} from 'express';
import {z} from 'zod';
import * as users from '../db/users.js';
import {HttpError} from '../lib/errors.js';
import {nonBlank, parseBody} from '../lib/validate.js';
import {requireRole, requireUser} from '../middleware/auth.js';

/** Store owner accounts (story 22). Only inspectors may use these routes. */
export const usersRouter = Router();

const EMAIL_REQUIRED = 'Email is required';
const PASSWORD_TOO_SHORT = 'Password must be at least 8 characters';

const newOwnerBody = z.object({
  firstName: nonBlank('First name'),
  lastName: nonBlank('Last name'),
  // Stored lower-case, so the same address can't be added twice in two cases.
  email: z
    .string(EMAIL_REQUIRED)
    .trim()
    .toLowerCase()
    .min(1, EMAIL_REQUIRED)
    .pipe(z.email('Enter a valid email')),
  // Not trimmed, like login: spaces can be part of a password. Supabase
  // refuses passwords over 72 characters.
  password: z
    .string(PASSWORD_TOO_SHORT)
    .min(8, PASSWORD_TOO_SHORT)
    .max(72, 'Password must be at most 72 characters'),
});

// requireRole runs before the body is read, so a store owner is refused
// whatever they send (AC 22.5).
usersRouter.post(
  '/users/store-owners',
  requireUser,
  requireRole('inspector'),
  async (req, res) => {
    const owner = parseBody(newOwnerBody, req);
    if (await users.findUserByEmail(owner.email)) {
      throw new HttpError(409, users.EMAIL_TAKEN, {email: users.EMAIL_TAKEN});
    }
    res.status(201).json(await users.createStoreOwner(owner));
  },
);

// The owners an inspector can choose from when adding a store (story 23).
usersRouter.get(
  '/users/store-owners',
  requireUser,
  requireRole('inspector'),
  async (_req, res) => {
    res.json(await users.listStoreOwners());
  },
);
