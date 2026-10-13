import {getSupabaseAdmin} from '../lib/supabase.js';
import type {AppUser, AppUserRow} from './types.js';

function toAppUser(row: AppUserRow): AppUser {
  return {
    id: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
  };
}

/** The app_user row for a Supabase Auth user ID, or null if there is none. */
export async function getUserById(id: string): Promise<AppUser | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('app_user')
    .select('user_id, first_name, last_name, email, role')
    .eq('user_id', id)
    .maybeSingle<AppUserRow>();
  if (error) throw error;
  return data && toAppUser(data);
}
