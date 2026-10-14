import {Router} from 'express';
import {z} from 'zod';
import * as users from '../db/users.js';
import {signIn, signOut} from '../lib/auth.js';
import {HttpError} from '../lib/errors.js';
import {nonBlank, parseBody} from '../lib/validate.js';
import {bearerToken, requireUser} from '../middleware/auth.js';

/** Login, logout and the current user (stories 1 and 4). */
export const authRouter = Router();

const loginBody = z.object({
  email: nonBlank('Email'),
  // Checked like nonBlank but not trimmed: spaces can be part of a password.
  password: z
    .string('Password is required')
    .refine((value) => value.trim() !== '', 'Password is required'),
});

authRouter.post('/auth/login', async (req, res) => {
  const {email, password} = parseBody(loginBody, req);
  const session = await signIn(email, password);
  const user = session && (await users.getUserById(session.userId));
  // One message for a wrong password and an unknown email (AC 1.3, 1.4).
  if (!session || !user) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  res.json({token: session.accessToken, expiresAt: session.expiresAt, user});
});

// Revokes the token itself, so a copy of it stops working too (story 4).
authRouter.post('/auth/logout', requireUser, async (req, res) => {
  await signOut(bearerToken(req)!);
  res.status(204).end();
});

authRouter.get('/me', requireUser, (req, res) => {
  res.json(req.user);
});
