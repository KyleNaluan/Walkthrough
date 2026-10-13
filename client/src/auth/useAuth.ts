import {createContext, useContext} from 'react';
import type {Role, User} from '../types';

export interface Auth {
  /** The logged-in user, or null. */
  user: User | null;
  /** Logs in; throws an ApiError if the server refuses. */
  login(email: string, password: string): Promise<void>;
  /** Forgets the session and goes to the login page. */
  logout(): void;
}

export const AuthContext = createContext<Auth | null>(null);

/** The login state. Use inside AuthProvider. */
export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside AuthProvider');
  return auth;
}

/** Where a user lands after login. The server filters an owner's stores. */
export function landingPathFor(_role: Role): string {
  return '/stores';
}
