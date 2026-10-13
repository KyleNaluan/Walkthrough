import {createClient, isAuthApiError} from '@supabase/supabase-js';
import {getEnv} from '../config/env.js';
import {getSupabaseAdmin} from './supabase.js';

export interface SignInResult {
  accessToken: string;
  /** Unix time in seconds, as Supabase reports it. */
  expiresAt: number;
  userId: string;
}

/** The Supabase Auth user ID for an access token, or null if invalid. */
export async function verifyToken(token: string): Promise<string | null> {
  const {data, error} = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Checks an email and password with Supabase Auth. Returns null when they
 * are rejected, whether the email is unknown or the password is wrong.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult | null> {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set');
  }
  // A new client per call: signing in on the shared admin client would make
  // its later queries run as this user, and row-level security blocks those.
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  const {data, error} = await client.auth.signInWithPassword({email, password});
  if (error) {
    // 4xx means Supabase refused the login; anything else is an outage.
    if (isAuthApiError(error) && error.status < 500) return null;
    throw error;
  }
  const {session} = data;
  return {
    accessToken: session.access_token,
    expiresAt:
      session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    userId: data.user.id,
  };
}
