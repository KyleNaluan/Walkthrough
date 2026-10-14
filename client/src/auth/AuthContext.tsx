import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {apiPost, setOnUnauthorized} from '../api';
import type {User} from '../types';
import {clearSession, readSession, writeSession, type Session} from './session';
import {AuthContext, type Auth} from './useAuth';

/** Holds the login state for the app. Must sit inside the router. */
export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(
    () => readSession()?.user ?? null,
  );
  const navigate = useNavigate();

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiPost<Session>('/api/auth/login', {
      email,
      password,
    });
    writeSession(session);
    setUser(session.user);
  }, []);

  /** Forgets the session in this tab and shows the login page. */
  const endSession = useCallback(() => {
    clearSession();
    setUser(null);
    navigate('/login', {replace: true});
  }, [navigate]);

  // Asks the server to revoke the token, so a copy of it stops working, but
  // doesn't wait: the session ends here even if the phone is offline. The
  // request reads the token before endSession clears it.
  const logout = useCallback(() => {
    apiPost('/api/auth/logout', {}).catch(() => {});
    endSession();
  }, [endSession]);

  // Any API call answered 401 means the session is over.
  useEffect(() => {
    setOnUnauthorized(endSession);
    return () => setOnUnauthorized(undefined);
  }, [endSession]);

  const auth = useMemo<Auth>(
    () => ({user, login, logout}),
    [user, login, logout],
  );
  return <AuthContext value={auth}>{children}</AuthContext>;
}
