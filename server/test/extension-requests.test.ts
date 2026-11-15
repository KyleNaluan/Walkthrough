import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {TicketRecord} from '../src/db/tickets.js';
import type {ExtensionStatus, TicketStatus} from '../src/db/types.js';
import {today} from '../src/lib/validate.js';
import {asUser} from './helpers/auth.js';
import {stores, users, type UserKey} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/tickets.js');

/** An extension request row in the fake database. */
interface FakeRequest {
  id: number;
  previousDeadline: string;
  requestedDeadline: string;
  reason: string;
  requestedAt: string;
  requesterId: string;
  status: ExtensionStatus;
  decision: {
    comment: string | null;
    decidedAt: string;
    deciderId: string;
  } | null;
}

interface FakeTicket {
  id: number;
  storeId: number;
  status: TicketStatus;
  deadline: string;
  requests: FakeRequest[];
}

const NOT_LATER = 'New deadline must be after the current one';
const WAITING = 'An extension request is already waiting';
const RESOLVED = 'This ticket is already resolved';
const NOTHING_WAITING = 'No extension request is waiting';
const DECIDED = 'This extension request has already been decided';
const DENY_COMMENT = 'A comment is required to deny a request';

/** A YYYY-MM-DD date `days` from today in the app's time zone. */
function inDays(days: number): string {
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEADLINE = '2999-01-10';
const LATER = '2999-02-01';

let db: Map<number, FakeTicket>;
let nextRequestId: number;

function ticket(
  id: number,
  storeId: number,
  status: TicketStatus,
  deadline = DEADLINE,
  requests: FakeRequest[] = [],
): FakeTicket {
  return {id, storeId, status, deadline, requests};
}

function fakeRequest(
  id: number,
  status: ExtensionStatus,
  decision: FakeRequest['decision'] = null,
): FakeRequest {
  return {
    id,
    previousDeadline: DEADLINE,
    requestedDeadline: LATER,
    reason: 'Parts are on back order',
    requestedAt: '2026-11-02T15:00:00Z',
    requesterId: users.ownerA.id,
    status,
    decision,
  };
}

function name(id: string): string {
  const user = Object.values(users).find((u) => u.id === id)!;
  return `${user.firstName} ${user.lastName}`;
}

/** The fake database as getTicket returns it. */
function toRecord(t: FakeTicket): TicketRecord {
  return {
    id: t.id,
    description: `Finding ${t.id}`,
    severity: 'medium',
    deadline: t.deadline,
    recordedAt: '2026-11-01T15:00:00Z',
    status: t.status,
    inspectionId: 1,
    store: {id: t.storeId, name: stores[t.storeId - 1].name},
    fixes: [],
    reinspections: [],
    extensionRequests: t.requests.map(({requesterId, decision, ...r}) => ({
      ...r,
      requesterName: name(requesterId),
      decision: decision && {
        comment: decision.comment,
        decidedAt: decision.decidedAt,
        deciderName: name(decision.deciderId),
      },
    })),
  };
}

/** A refusal from the status functions, as Supabase reports it. */
function p0001(message: string) {
  return Object.assign(new Error(message), {code: 'P0001'});
}

beforeEach(() => {
  // Stores 1-2 belong to ownerA, store 3 to ownerB.
  db = new Map(
    [
      ticket(1, 1, 'open'),
      // Overdue: its deadline has passed.
      ticket(2, 1, 'changes_requested', '2000-01-10'),
      ticket(3, 3, 'open'),
      ticket(4, 1, 'pending_review', DEADLINE, [fakeRequest(40, 'pending')]),
      ticket(5, 1, 'resolved'),
      ticket(6, 2, 'open', DEADLINE, [
        fakeRequest(41, 'denied', {
          comment: 'Fix the cooler first.',
          decidedAt: '2026-11-03T15:00:00Z',
          deciderId: users.inspector.id,
        }),
      ]),
      ticket(7, 2, 'reinspection_scheduled'),
      // Overdue, with a pending request for a later date.
      ticket(8, 1, 'changes_requested', '2000-01-10', [
        {...fakeRequest(42, 'pending'), previousDeadline: '2000-01-10'},
      ]),
      // Another owner's store, with a pending request.
      ticket(9, 3, 'open', DEADLINE, [fakeRequest(43, 'pending')]),
    ].map((t) => [t.id, t]),
  );
  nextRequestId = 100;

  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(ticketsDb.getTicket).mockImplementation(async (id) => {
    const t = db.get(id);
    return t ? toRecord(t) : null;
  });
  // The same checks as request_extension in 007_extension_requests.sql.
  vi.mocked(ticketsDb.requestExtension).mockImplementation(
    async (ticketId, ownerId, deadline, reason) => {
      const t = db.get(ticketId)!;
      if (t.status === 'resolved') throw p0001(RESOLVED);
      if (t.requests.some((r) => r.status === 'pending')) {
        throw p0001(WAITING);
      }
      if (deadline <= t.deadline) throw p0001(NOT_LATER);
      const id = nextRequestId++;
      t.requests.push({
        id,
        previousDeadline: t.deadline,
        requestedDeadline: deadline,
        reason,
        requestedAt: '2026-11-15T15:00:00Z',
        requesterId: ownerId,
        status: 'pending',
        decision: null,
      });
      return id;
    },
  );
  // The same checks as decide_extension in 007_extension_requests.sql.
  vi.mocked(ticketsDb.decideExtension).mockImplementation(
    async (requestId, inspectorId, decision, comment) => {
      const t = [...db.values()].find((x) =>
        x.requests.some((r) => r.id === requestId),
      );
      const r = t?.requests.find((x) => x.id === requestId);
      if (!t || !r) throw p0001(NOTHING_WAITING);
      if (r.status !== 'pending') throw p0001(DECIDED);
      if (decision === 'denied' && !comment) throw p0001(DENY_COMMENT);
      r.status = decision;
      r.decision = {
        comment,
        decidedAt: '2026-11-15T16:00:00Z',
        deciderId: inspectorId,
      };
      if (decision === 'approved') t.deadline = r.requestedDeadline;
    },
  );
});

function requestExtension(
  ticketId: number,
  user: UserKey,
  body: Record<string, unknown> = {
    deadline: LATER,
    reason: 'Parts are on back order',
  },
) {
  return request(app)
    .post(`/api/tickets/${ticketId}/extension-requests`)
    .set(asUser(user))
    .send(body);
}

describe('GET /api/tickets/:ticketId extension requests (story 17)', () => {
  it('lists each request with who asked, the dates and the reason', async () => {
    const res = await request(app).get('/api/tickets/4').set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body.extensionRequests).toEqual([
      {
        id: 40,
        previousDeadline: DEADLINE,
        requestedDeadline: LATER,
        reason: 'Parts are on back order',
        requestedAt: '2026-11-02T15:00:00Z',
        requesterName: 'Olivia Owner',
        status: 'pending',
        decision: null,
      },
    ]);
  });

  it('shows the request to an inspector too', async () => {
    const res = await request(app)
      .get('/api/tickets/4')
      .set(asUser('inspector2'));
    expect(res.body.extensionRequests).toHaveLength(1);
  });
});

describe('POST /api/tickets/:ticketId/extension-requests (story 17)', () => {
  it('saves the request as Pending and shows it on the ticket (AC 17.1)', async () => {
    const res = await requestExtension(1, 'ownerA', {
      deadline: LATER,
      reason: '  Parts are on back order  ',
    });
    expect(res.status).toBe(201);
    expect(ticketsDb.requestExtension).toHaveBeenCalledWith(
      1,
      users.ownerA.id,
      LATER,
      'Parts are on back order',
    );
    expect(res.body.extensionRequests).toEqual([
      expect.objectContaining({
        status: 'pending',
        previousDeadline: DEADLINE,
        requestedDeadline: LATER,
        reason: 'Parts are on back order',
        requesterName: 'Olivia Owner',
        decision: null,
      }),
    ]);
    // The deadline only moves once an inspector approves (story 18).
    expect(res.body.deadline).toBe(DEADLINE);
  });

  it.each([
    [1, 'open'],
    [7, 'reinspection_scheduled'],
  ])(
    'accepts a request on ticket %i, which is %s and unresolved (AC 17.1)',
    async (ticketId) => {
      const res = await requestExtension(ticketId, 'ownerA');
      expect(res.status).toBe(201);
    },
  );

  it('accepts an overdue ticket asking for today or later (AC 17.1)', async () => {
    const res = await requestExtension(2, 'ownerA', {
      deadline: today(),
      reason: 'The new cooler arrives today',
    });
    expect(res.status).toBe(201);
    expect(res.body.extensionRequests[0]).toMatchObject({
      previousDeadline: '2000-01-10',
      requestedDeadline: today(),
    });
  });

  it('takes a new request after an earlier one was denied', async () => {
    const res = await requestExtension(6, 'ownerA');
    expect(res.status).toBe(201);
    expect(
      res.body.extensionRequests.map((r: {status: string}) => r.status),
    ).toEqual(['denied', 'pending']);
  });

  it.each([
    ['the current deadline', DEADLINE],
    ['an earlier date', '2999-01-09'],
  ])(
    'refuses %s, marks the date and saves nothing (AC 17.2)',
    async (_, deadline) => {
      const res = await requestExtension(1, 'ownerA', {
        deadline,
        reason: 'Parts are on back order',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: NOT_LATER,
        fields: {deadline: NOT_LATER},
      });
      expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    },
  );

  it('refuses a date in the past even if it is after an overdue deadline', async () => {
    const res = await requestExtension(2, 'ownerA', {
      deadline: inDays(-1),
      reason: 'Parts are on back order',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      deadline: 'New deadline cannot be in the past',
    });
    expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
  });

  it.each([undefined, 'next week', '2999-02-31'])(
    'refuses deadline %j as not a date',
    async (deadline) => {
      const res = await requestExtension(1, 'ownerA', {
        deadline,
        reason: 'Parts are on back order',
      });
      expect(res.status).toBe(400);
      expect(res.body.fields).toEqual({
        deadline: 'New deadline must be a date',
      });
      expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '   '])(
    'refuses reason %j, marks the reason as required and saves nothing (AC 17.3)',
    async (reason) => {
      const res = await requestExtension(1, 'ownerA', {
        deadline: LATER,
        reason,
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Reason is required',
        fields: {reason: 'Reason is required'},
      });
      expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    },
  );

  it('marks the date and the reason together', async () => {
    const res = await requestExtension(1, 'ownerA', {
      deadline: DEADLINE,
      reason: ' ',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      deadline: NOT_LATER,
      reason: 'Reason is required',
    });
  });

  it('refuses a second request while one is Pending and saves nothing (AC 17.4)', async () => {
    const res = await requestExtension(4, 'ownerA', {
      deadline: '2999-03-01',
      reason: 'Even more time',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: WAITING});
    expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    expect(db.get(4)!.requests).toHaveLength(1);
  });

  it('passes on the refusal if a request arrived in the meantime (AC 17.4)', async () => {
    vi.mocked(ticketsDb.requestExtension).mockRejectedValueOnce(p0001(WAITING));
    const res = await requestExtension(1, 'ownerA');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: WAITING});
  });

  it('refuses a request on a Resolved ticket and saves nothing (AC 17.5)', async () => {
    const res = await requestExtension(5, 'ownerA');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: RESOLVED});
    expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    expect(db.get(5)!.requests).toEqual([]);
  });

  it.each(['inspector', 'inspector2'] as const)(
    'refuses the %s with "Access denied" and saves nothing (AC 17.6)',
    async (user) => {
      const res = await requestExtension(1, user);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    },
  );

  it('refuses another store\'s owner with "Access denied" and saves nothing (AC 17.6)', async () => {
    const res = await requestExtension(1, 'ownerB');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
    expect(db.get(1)!.requests).toEqual([]);
  });

  it('answers another store\'s owner "Access denied" before looking at what they sent (AC 17.6)', async () => {
    const res = await requestExtension(1, 'ownerB', {
      deadline: 'x',
      reason: '',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });

  it('sends 404 for a ticket that does not exist', async () => {
    const res = await requestExtension(99, 'ownerA');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Ticket not found'});
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app)
      .post('/api/tickets/1/extension-requests')
      .send({deadline: LATER, reason: 'x'});
    expect(res.status).toBe(401);
    expect(ticketsDb.requestExtension).not.toHaveBeenCalled();
  });
});

function decide(
  ticketId: number,
  requestId: number,
  user: UserKey,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/tickets/${ticketId}/extension-requests/${requestId}/decision`)
    .set(asUser(user))
    .send(body);
}

describe('POST /api/tickets/:ticketId/extension-requests/:requestId/decision (story 18)', () => {
  it('approves: the deadline becomes the requested date and the decision is on the ticket (AC 18.1)', async () => {
    const res = await decide(4, 40, 'inspector2', {decision: 'approved'});
    expect(res.status).toBe(200);
    expect(ticketsDb.decideExtension).toHaveBeenCalledWith(
      40,
      users.inspector2.id,
      'approved',
      null,
    );
    expect(res.body.deadline).toBe(LATER);
    expect(res.body.extensionRequests).toEqual([
      expect.objectContaining({
        id: 40,
        status: 'approved',
        previousDeadline: DEADLINE,
        decision: {
          comment: null,
          decidedAt: '2026-11-15T16:00:00Z',
          deciderName: 'Ivan Checks',
        },
      }),
    ]);
  });

  it('no longer marks the ticket Overdue once the new date is in the future (AC 18.1)', async () => {
    const before = await request(app)
      .get('/api/tickets/8')
      .set(asUser('inspector'));
    expect(before.body.overdue).toBe(true);
    const res = await decide(8, 42, 'inspector', {decision: 'approved'});
    expect(res.status).toBe(200);
    expect(res.body.deadline).toBe(LATER);
    expect(res.body.overdue).toBe(false);
  });

  it('still marks the ticket Overdue if the approved date has already passed (AC 18.1)', async () => {
    db.get(8)!.requests[0].requestedDeadline = inDays(-1);
    const res = await decide(8, 42, 'inspector', {decision: 'approved'});
    expect(res.status).toBe(200);
    expect(res.body.overdue).toBe(true);
  });

  it('keeps an optional comment on an approval', async () => {
    await decide(4, 40, 'inspector', {
      decision: 'approved',
      comment: '  Fine, but no more extensions.  ',
    });
    expect(ticketsDb.decideExtension).toHaveBeenCalledWith(
      40,
      users.inspector.id,
      'approved',
      'Fine, but no more extensions.',
    );
  });

  it('denies with a comment: the deadline stays and the owner sees the denial and comment (AC 18.2)', async () => {
    const res = await decide(4, 40, 'inspector', {
      decision: 'denied',
      comment: '  Moving the chicken needs no parts.  ',
    });
    expect(res.status).toBe(200);
    expect(res.body.deadline).toBe(DEADLINE);
    expect(ticketsDb.decideExtension).toHaveBeenCalledWith(
      40,
      users.inspector.id,
      'denied',
      'Moving the chicken needs no parts.',
    );
    const seen = await request(app).get('/api/tickets/4').set(asUser('ownerA'));
    expect(seen.body.extensionRequests[0]).toMatchObject({
      status: 'denied',
      decision: {
        comment: 'Moving the chicken needs no parts.',
        deciderName: 'Ina Spector',
      },
    });
  });

  it.each([undefined, '', '   '])(
    'refuses a denial with comment %j, marks the comment and saves nothing (AC 18.3)',
    async (comment) => {
      const res = await decide(4, 40, 'inspector', {
        decision: 'denied',
        comment,
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: DENY_COMMENT,
        fields: {comment: DENY_COMMENT},
      });
      expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
      expect(db.get(4)!.requests[0].status).toBe('pending');
    },
  );

  it.each([
    [1, 'has never had a request'],
    [6, 'only has a denied request'],
  ])('changes nothing on ticket %i, which %s (AC 18.4)', async (ticketId) => {
    const before = structuredClone(db.get(ticketId));
    const res = await decide(ticketId, 41, 'inspector', {
      decision: 'approved',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: NOTHING_WAITING});
    expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
    expect(db.get(ticketId)).toEqual(before);
  });

  it('refuses to decide a request other than the one waiting', async () => {
    const res = await decide(4, 41, 'inspector', {decision: 'approved'});
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: DECIDED});
    expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
  });

  it('passes on the refusal if another inspector decided it in the meantime', async () => {
    vi.mocked(ticketsDb.decideExtension).mockRejectedValueOnce(p0001(DECIDED));
    const res = await decide(4, 40, 'inspector', {decision: 'approved'});
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: DECIDED});
  });

  it.each([
    ['approved', undefined],
    ['denied', 'No'],
  ])(
    'refuses a store owner who sends %s with "Access denied" and changes nothing (AC 18.5)',
    async (decision, comment) => {
      const res = await decide(4, 40, 'ownerA', {decision, comment});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
      expect(db.get(4)!.deadline).toBe(DEADLINE);
      expect(db.get(4)!.requests[0].status).toBe('pending');
    },
  );

  it("refuses another store's owner too (AC 18.5)", async () => {
    const res = await decide(9, 43, 'ownerB', {decision: 'approved'});
    expect(res.status).toBe(403);
    expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
  });

  it('refuses an unknown decision', async () => {
    const res = await decide(4, 40, 'inspector', {decision: 'maybe'});
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      decision: 'Decision must be approved or denied',
    });
    expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
  });

  it('sends 404 for a ticket that does not exist', async () => {
    const res = await decide(99, 40, 'inspector', {decision: 'approved'});
    expect(res.status).toBe(404);
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app)
      .post('/api/tickets/4/extension-requests/40/decision')
      .send({decision: 'approved'});
    expect(res.status).toBe(401);
    expect(ticketsDb.decideExtension).not.toHaveBeenCalled();
  });
});
