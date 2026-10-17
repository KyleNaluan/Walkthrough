import {describe, expect, it, vi} from 'vitest';
import * as ticketsDb from '../src/db/tickets.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';
import {users} from './helpers/users.js';

describe('re-inspection status functions (story 12)', () => {
  /** A fake Supabase client that records each rpc call and succeeds. */
  function fakeRpc() {
    const calls: unknown[][] = [];
    const client = {
      rpc: async (...args: unknown[]) => {
        calls.push(args);
        return {error: null};
      },
    };
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce(
      client as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    return calls;
  }

  it('sends the re-inspection date to review_fix (AC 12.1)', async () => {
    const calls = fakeRpc();
    await ticketsDb.scheduleReinspection(
      11,
      users.inspector.id,
      null,
      '2999-01-01',
    );
    expect(calls).toEqual([
      [
        'review_fix',
        {
          p_fix_id: 11,
          p_reviewer_id: users.inspector.id,
          p_decision: 'reinspection_scheduled',
          p_comment: null,
          p_scheduled_for: '2999-01-01',
        },
      ],
    ]);
  });

  it('sends the ticket, re-inspection, visit and result to record_reinspection (AC 12.2, 12.3)', async () => {
    const calls = fakeRpc();
    await ticketsDb.recordReinspection(6, 31, 20, 'failed');
    expect(calls).toEqual([
      [
        'record_reinspection',
        {
          p_ticket_id: 6,
          p_reinspection_id: 31,
          p_inspection_id: 20,
          p_outcome: 'failed',
        },
      ],
    ]);
  });
});
