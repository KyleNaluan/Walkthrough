import {isAuthApiError} from '@supabase/supabase-js';
import {HttpError} from '../lib/errors.js';
import {getSupabaseAdmin} from '../lib/supabase.js';
import type {AppUser, AppUserRow} from './types.js';

const userColumns = 'user_id, first_name, last_name, email, role';

/** The message for an email that already has an account (AC 22.2). */
export const EMAIL_TAKEN = 'An account with this email already exists';

function toAppUser(row: AppUserRow): AppUser {
  return {
    id: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
  };
}

function emailTaken(): HttpError {
  return new HttpError(409, EMAIL_TAKEN, {email: EMAIL_TAKEN});
}

/** The app_user row for a Supabase Auth user ID, or null if there is none. */
export async function getUserById(id: string): Promise<AppUser | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('app_user')
    .select(userColumns)
    .eq('user_id', id)
    .maybeSingle<AppUserRow>();
  if (error) throw error;
  return data && toAppUser(data);
}

/** The user with this email, ignoring case, or null if there is none. */
export async function findUserByEmail(email: string): Promise<AppUser | null> {
  // ilike ignores case; escape its wildcards so they match literally.
  const pattern = email.replace(/[\\%_]/g, (char) => `\\${char}`);
  const {data, error} = await getSupabaseAdmin()
    .from('app_user')
    .select(userColumns)
    .ilike('email', pattern)
    .maybeSingle<AppUserRow>();
  if (error) throw error;
  return data && toAppUser(data);
}

/** Every store owner account, by last name then first name (for story 23). */
export async function listStoreOwners(): Promise<AppUser[]> {
  const {data, error} = await getSupabaseAdmin()
    .from('app_user')
    .select(userColumns)
    .eq('role', 'store_owner')
    .order('last_name')
    .order('first_name')
    .overrideTypes<AppUserRow[], {merge: false}>();
  if (error) throw error;
  return data.map(toAppUser);
}

export interface NewStoreOwner {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * Creates a store owner who can log in at once: a Supabase Auth user with
 * the password, and its app_user row (story 22). If the row can't be saved,
 * the Auth user is deleted again, so a failed attempt never leaves an
 * account that blocks the email.
 */
export async function createStoreOwner(owner: NewStoreOwner): Promise<AppUser> {
  const db = getSupabaseAdmin();
  const {data, error} = await db.auth.admin.createUser({
    email: owner.email,
    password: owner.password,
    email_confirm: true,
  });
  if (error) {
    if (
      isAuthApiError(error) &&
      (error.code === 'email_exists' || error.code === 'user_already_exists')
    ) {
      throw emailTaken();
    }
    // The Supabase project's own password rules, if stricter than ours.
    if (isAuthApiError(error) && error.code === 'weak_password') {
      throw new HttpError(400, error.message, {password: error.message});
    }
    throw error;
  }

  const userId = data.user.id;
  const {data: row, error: insertError} = await db
    .from('app_user')
    .insert({
      user_id: userId,
      first_name: owner.firstName,
      last_name: owner.lastName,
      email: owner.email,
      role: 'store_owner',
    })
    .select(userColumns)
    .single<AppUserRow>();
  if (insertError) {
    const {error: deleteError} = await db.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Could not remove a half-created account', deleteError);
    }
    if (insertError.code === '23505') throw emailTaken();
    throw insertError;
  }
  return toAppUser(row);
}
