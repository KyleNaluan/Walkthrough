import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {getEnv} from '../config/env.js';

let adminClient: SupabaseClient | undefined;

/**
 * Server-side Supabase client using the secret key. Created on first
 * use so importing this module never requires secrets. Every route that uses
 * it must still check the caller's role and store access itself.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set');
  }
  adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  return adminClient;
}
