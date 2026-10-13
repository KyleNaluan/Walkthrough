// Wipes the shared Supabase database and fills it with test data.
// Run with `npm run seed -w server -- --yes`. One person at a time (D8).
import type {SupabaseClient} from '@supabase/supabase-js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';
import {today} from '../src/lib/validate.js';
import {
  buildSeedPlan,
  SEED_EMAIL_DOMAIN,
  SEED_PHOTO_PATH,
  type SeedPlan,
} from './seed-data.js';

const BUCKET = 'photos';

// A 1×1 PNG, used for every seeded photo.
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** The success branch of a Supabase result. */
type Success<R> = Extract<R, {data: unknown; error: null}>['data'];

/** Throws a Supabase error if there is one, otherwise returns the data. */
function check<R extends {data: unknown; error: unknown}>(
  result: R,
): Success<R> {
  if (result.error) throw result.error;
  return result.data as Success<R>;
}

/** The value for a key the plan itself defined. */
function lookup<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed plan has no ${String(key)}`);
  return value;
}

/** Deletes every row, children first, then the seed accounts and photos. */
async function clear(db: SupabaseClient): Promise<void> {
  const tables = [
    ['reinspection', 'reinspection_id'],
    ['fix_submission', 'fix_submission_id'],
    ['ticket', 'ticket_id'],
    ['inspection', 'inspection_id'],
    ['store', 'store_id'],
    ['app_user', 'user_id'],
  ];
  for (const [table, key] of tables) {
    // PostgREST refuses a delete without a filter.
    check(await db.from(table).delete().not(key, 'is', null));
  }

  // Collect first: deleting while paging would shift users between pages.
  const seeded: string[] = [];
  for (let page = 1; ; page++) {
    const {users} = check(await db.auth.admin.listUsers({page, perPage: 1000}));
    for (const user of users) {
      if (user.email?.endsWith(SEED_EMAIL_DOMAIN)) seeded.push(user.id);
    }
    if (users.length < 1000) break;
  }
  for (const id of seeded) {
    check(await db.auth.admin.deleteUser(id));
  }

  const files = check(await db.storage.from(BUCKET).list('seed'));
  if (files.length > 0) {
    check(
      await db.storage
        .from(BUCKET)
        .remove(files.map((file) => `seed/${file.name}`)),
    );
  }
}

/** Inserts the plan and returns the store IDs by name, for the summary. */
async function insert(
  db: SupabaseClient,
  plan: SeedPlan,
  password: string,
): Promise<Map<string, number>> {
  check(
    await db.storage
      .from(BUCKET)
      .upload(SEED_PHOTO_PATH, SAMPLE_PNG, {contentType: 'image/png'}),
  );

  const userIds = new Map<string, string>();
  for (const user of plan.users) {
    const {user: created} = check(
      await db.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
      }),
    );
    userIds.set(user.email, created.id);
    check(
      await db.from('app_user').insert({
        user_id: created.id,
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        role: user.role,
      }),
    );
  }
  const userId = (email: string) => lookup(userIds, email);

  const storeIds = new Map<string, number>();
  for (const store of plan.stores) {
    const row = check(
      await db
        .from('store')
        .insert({
          name: store.name,
          address: store.address,
          owner_id: userId(store.ownerEmail),
        })
        .select('store_id')
        .single<{store_id: number}>(),
    );
    storeIds.set(store.name, row.store_id);
  }

  const inspectionIds = new Map<string, number>();
  for (const inspection of plan.inspections) {
    const row = check(
      await db
        .from('inspection')
        .insert({
          started_at: inspection.startedAt,
          store_id: lookup(storeIds, inspection.storeName),
          inspector_id: userId(inspection.inspectorEmail),
        })
        .select('inspection_id')
        .single<{inspection_id: number}>(),
    );
    inspectionIds.set(inspection.key, row.inspection_id);
  }

  for (const ticket of plan.tickets) {
    const {ticket_id: ticketId} = check(
      await db
        .from('ticket')
        .insert({
          description: ticket.description,
          severity: ticket.severity,
          deadline: ticket.deadline,
          photo: SEED_PHOTO_PATH,
          recorded_at: ticket.recordedAt,
          status: ticket.status,
          inspection_id: lookup(inspectionIds, ticket.inspectionKey),
        })
        .select('ticket_id')
        .single<{ticket_id: number}>(),
    );
    for (const fix of ticket.fixes) {
      check(
        await db.from('fix_submission').insert({
          description: fix.description,
          photo: SEED_PHOTO_PATH,
          submitted_at: fix.submittedAt,
          ticket_id: ticketId,
          reviewer_id: fix.review && userId(fix.review.reviewerEmail),
          review_decision: fix.review?.decision ?? null,
          review_comment: fix.review?.comment ?? null,
          reviewed_at: fix.review?.reviewedAt ?? null,
        }),
      );
    }
    if (ticket.reinspection) {
      check(
        await db.from('reinspection').insert({
          scheduled_for: ticket.reinspection.scheduledFor,
          created_at: ticket.reinspection.createdAt,
          ticket_id: ticketId,
          inspector_id: userId(ticket.reinspection.inspectorEmail),
        }),
      );
    }
  }
  return storeIds;
}

function printSummary(plan: SeedPlan, storeIds: Map<string, number>): void {
  console.log('\nAccounts (password: SEED_PASSWORD from server/.env)');
  console.table(
    plan.users.map((user) => ({
      email: user.email,
      role: user.role,
      stores:
        user.role === 'inspector'
          ? 'all'
          : plan.stores.filter((store) => store.ownerEmail === user.email)
              .length,
    })),
  );
  console.log('Stores');
  console.table(
    plan.stores.map((store) => ({
      id: storeIds.get(store.name),
      name: store.name,
      owner: store.ownerEmail,
      inspections: plan.inspections.filter(
        (inspection) => inspection.storeName === store.name,
      ).length,
    })),
  );
  console.log(`Tickets: ${plan.tickets.length}`);
}

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    console.error(
      'This deletes ALL data in the shared database and recreates the seed.\n' +
        'Tell the team first, then run: npm run seed -w server -- --yes\n' +
        "(in PowerShell, quote the --: npm run seed -w server '--' --yes)",
    );
    process.exit(1);
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) {
    console.error('Set SEED_PASSWORD in server/.env (shared privately).');
    process.exit(1);
  }

  const db = getSupabaseAdmin();
  const plan = buildSeedPlan(new Date(), today());
  console.log('Clearing the database...');
  await clear(db);
  console.log('Inserting seed data...');
  const storeIds = await insert(db, plan, password);
  printSummary(plan, storeIds);
}

await main();
