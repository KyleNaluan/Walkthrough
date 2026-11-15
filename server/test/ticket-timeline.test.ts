import {describe, expect, it, vi} from 'vitest';
import * as ticketsDb from '../src/db/tickets.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';

describe('getTicket query (story 13)', () => {
  /** A fake Supabase query that records each call and returns `row`. */
  function fakeQuery(row: unknown) {
    const calls: [string, ...unknown[]][] = [];
    const query: Record<string, unknown> = {};
    for (const name of ['from', 'select', 'eq']) {
      query[name] = (...args: unknown[]) => {
        calls.push([name, ...args]);
        return query;
      };
    }
    query.maybeSingle = async () => ({data: row, error: null});
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce(
      query as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    return calls;
  }

  const dbRow = {
    ticket_id: 4,
    description: 'Raw chicken stored above salad',
    severity: 'high',
    deadline: '2026-10-20',
    recorded_at: '2026-09-30T15:00:00+00:00',
    status: 'reinspection_scheduled',
    inspection_id: 1,
    inspection: {store: {store_id: 1, name: 'Main St Diner'}},
    fix_submission: [],
    reinspection: [],
    extension_request: [],
  };

  it('asks for the fixes with their reviews, each re-inspection with its visit and each extension request (AC 13.1, 17.1)', async () => {
    const calls = fakeQuery(dbRow);
    await ticketsDb.getTicket(4);
    const select = calls.find(([name]) => name === 'select')![1] as string;
    expect(select.replace(/\s/g, '')).toBe(
      'ticket_id,description,severity,deadline,recorded_at,status,' +
        'inspection_id,inspection!inner(store!inner(store_id,name)),' +
        'fix_submission(fix_submission_id,description,submitted_at,' +
        'review_decision,review_comment,reviewed_at,' +
        'reviewer:app_user(first_name,last_name)),' +
        'reinspection(reinspection_id,scheduled_for,outcome,created_at,' +
        'visit:inspection(inspection_id,started_at,' +
        'inspector:app_user(first_name,last_name))),' +
        'extension_request(extension_request_id,previous_deadline,' +
        'requested_deadline,reason,requested_at,status,decision_comment,' +
        'decided_at,' +
        // Two links to app_user, so each embed names its foreign key.
        'requester:app_user!extension_request_requested_by_fkey(' +
        'first_name,last_name),' +
        'decider:app_user!extension_request_decided_by_fkey(' +
        'first_name,last_name))',
    );
  });

  it('gives each re-inspection with its date and visit, oldest first (AC 13.1)', async () => {
    const calls = fakeQuery({
      ...dbRow,
      // PostgREST does not order embedded rows.
      reinspection: [
        {
          reinspection_id: 2,
          scheduled_for: '2026-10-20',
          outcome: 'pending',
          created_at: '2026-10-07T15:00:00+00:00',
          visit: null,
        },
        {
          reinspection_id: 1,
          scheduled_for: '2026-10-05',
          outcome: 'failed',
          created_at: '2026-10-02T15:00:00+00:00',
          visit: {
            inspection_id: 20,
            started_at: '2026-10-05T14:00:00+00:00',
            inspector: {first_name: 'Ina', last_name: 'Spector'},
          },
        },
      ],
    });
    const ticket = await ticketsDb.getTicket(4);
    expect(calls).toContainEqual(['eq', 'ticket_id', 4]);
    expect(ticket!.reinspections).toEqual([
      {
        id: 1,
        scheduledFor: '2026-10-05',
        outcome: 'failed',
        createdAt: '2026-10-02T15:00:00+00:00',
        visit: {
          inspectionId: 20,
          startedAt: '2026-10-05T14:00:00+00:00',
          inspectorName: 'Ina Spector',
        },
      },
      {
        id: 2,
        scheduledFor: '2026-10-20',
        outcome: 'pending',
        createdAt: '2026-10-07T15:00:00+00:00',
        visit: null,
      },
    ]);
  });

  it('gives a ticket with no fix only its finding (AC 13.4)', async () => {
    fakeQuery({...dbRow, status: 'open'});
    const ticket = await ticketsDb.getTicket(4);
    expect(ticket).toMatchObject({
      recordedAt: '2026-09-30T15:00:00+00:00',
      fixes: [],
      reinspections: [],
      extensionRequests: [],
    });
  });

  it('gives each extension request, oldest first, with its decision once made (AC 17.1, 18.1)', async () => {
    fakeQuery({
      ...dbRow,
      // PostgREST does not order embedded rows.
      extension_request: [
        {
          extension_request_id: 9,
          previous_deadline: '2026-10-27',
          requested_deadline: '2026-11-03',
          reason: 'Waiting on a plumber',
          requested_at: '2026-10-21T15:00:00+00:00',
          status: 'pending',
          decision_comment: null,
          decided_at: null,
          requester: {first_name: 'Olivia', last_name: 'Owner'},
          decider: null,
        },
        {
          extension_request_id: 8,
          previous_deadline: '2026-10-20',
          requested_deadline: '2026-10-27',
          reason: 'Parts are on back order',
          requested_at: '2026-10-10T15:00:00+00:00',
          status: 'approved',
          decision_comment: null,
          decided_at: '2026-10-11T15:00:00+00:00',
          requester: {first_name: 'Olivia', last_name: 'Owner'},
          decider: {first_name: 'Ina', last_name: 'Spector'},
        },
      ],
    });
    const ticket = await ticketsDb.getTicket(4);
    expect(ticket!.extensionRequests).toEqual([
      {
        id: 8,
        previousDeadline: '2026-10-20',
        requestedDeadline: '2026-10-27',
        reason: 'Parts are on back order',
        requestedAt: '2026-10-10T15:00:00+00:00',
        requesterName: 'Olivia Owner',
        status: 'approved',
        decision: {
          comment: null,
          decidedAt: '2026-10-11T15:00:00+00:00',
          deciderName: 'Ina Spector',
        },
      },
      {
        id: 9,
        previousDeadline: '2026-10-27',
        requestedDeadline: '2026-11-03',
        reason: 'Waiting on a plumber',
        requestedAt: '2026-10-21T15:00:00+00:00',
        requesterName: 'Olivia Owner',
        status: 'pending',
        decision: null,
      },
    ]);
  });

  it('gives a request closed by resolving the ticket no decision (AC 17.5)', async () => {
    fakeQuery({
      ...dbRow,
      status: 'resolved',
      extension_request: [
        {
          extension_request_id: 9,
          previous_deadline: '2026-10-27',
          requested_deadline: '2026-11-03',
          reason: 'Waiting on a plumber',
          requested_at: '2026-10-21T15:00:00+00:00',
          // 007 closes a pending request when its ticket is resolved.
          status: 'closed',
          decision_comment: null,
          decided_at: '2026-10-22T15:00:00+00:00',
          requester: {first_name: 'Olivia', last_name: 'Owner'},
          decider: null,
        },
      ],
    });
    const ticket = await ticketsDb.getTicket(4);
    expect(ticket!.extensionRequests).toEqual([
      {
        id: 9,
        previousDeadline: '2026-10-27',
        requestedDeadline: '2026-11-03',
        reason: 'Waiting on a plumber',
        requestedAt: '2026-10-21T15:00:00+00:00',
        requesterName: 'Olivia Owner',
        status: 'closed',
        decision: null,
      },
    ]);
  });
});
