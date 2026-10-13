import type {User} from '../types';

/** What POST /api/auth/login returns. expiresAt is Unix time in seconds. */
export interface Session {
  token: string;
  expiresAt: number;
  user: User;
}

const KEY = 'walkthrough.session';

// sessionStorage clears when the tab closes (decision D3). Access can throw,
// e.g. with storage blocked, so every call is wrapped.

/** The stored session, or null if there is none or it has expired. */
export function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<Session>;
    if (
      typeof session.token !== 'string' ||
      typeof session.expiresAt !== 'number' ||
      !session.user
    ) {
      return null;
    }
    if (session.expiresAt * 1000 <= Date.now()) return null;
    return session as Session;
  } catch {
    return null;
  }
}

/** Saves the session for this tab. */
export function writeSession(session: Session): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Logged in for this page view only.
  }
}

/** Forgets the session. */
export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored, so nothing to clear.
  }
}
