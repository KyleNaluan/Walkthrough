import type {AppUser} from '../db/types.js';

declare global {
  namespace Express {
    interface Request {
      /** The logged-in user, set by requireUser. */
      user?: AppUser;
    }
  }
}
