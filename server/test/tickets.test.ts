import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {TicketRecord} from '../src/db/tickets.js';
import type {ReviewDecision, TicketStatus} from '../src/db/types.js';
import {deletePhoto, signedPhotoUrl, uploadPhoto} from '../src/lib/photos.js';
import {asUser} from './helpers/auth.js';
import {stores, users} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/tickets.js');
// Real photo checks; only the storage calls are faked.
vi.mock('../src/lib/photos.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/photos.js')>()),
  uploadPhoto: vi.fn(async () => 'fixes/new.png'),
  deletePhoto: vi.fn(async () => {}),
  signedPhotoUrl: vi.fn(async (path: string) => `https://signed.test/${path}`),
}));

// 1×1 PNG, as in photos.test.ts.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** A fix row in the fake database, with the reviewer's ID and photo path. */
interface FakeFix {
  id: number;
  description: string;
  photo: string;
  submittedAt: string;
  review: {
    decision: ReviewDecision;
    comment: string | null;
    reviewedAt: string;
    reviewerId: string;
  } | null;
}

/** A re-inspection row in the fake database, with its visit once recorded. */
interface FakeReinspection {
  id: number;
  scheduledFor: string;
  outcome: 'pending' | 'passed' | 'failed';
  inspectionId: number | null;
}

interface FakeTicket {
  id: number;
  storeId: number;
  status: TicketStatus;
  deadline: string;
  fixes: FakeFix[];
  reinspections: FakeReinspection[];
}

let db: Map<number, FakeTicket>;
let nextFixId: number;

function ticket(
  id: number,
  storeId: number,
  status: TicketStatus,
  fixes: FakeFix[] = [],
  reinspections: FakeReinspection[] = [],
): FakeTicket {
  return {id, storeId, status, deadline: '2999-01-01', fixes, reinspections};
}

function fix(id: number, review: FakeFix['review'] = null): FakeFix {
  return {
    id,
    description: `Fix ${id}`,
    photo: `fixes/${id}.png`,
    submittedAt: '2026-10-01T15:00:00Z',
    review,
  };
}

function reinspection(
  id: number,
  outcome: FakeReinspection['outcome'] = 'pending',
  inspectionId: number | null = null,
): FakeReinspection {
  return {id, scheduledFor: '2999-01-01', outcome, inspectionId};
}

const changesRequested = {
  decision: 'changes_requested' as const,
  comment: 'Move the chicken to the bottom shelf.',
  reviewedAt: '2026-10-02T15:00:00Z',
  reviewerId: users.inspector.id,
};

/** The fake database as getTicket returns it. */
function toRecord(t: FakeTicket): TicketRecord {
  const reviewer = (id: string) =>
    Object.values(users).find((user) => user.id === id)!;
  return {
    id: t.id,
    description: `Finding ${t.id}`,
    severity: 'high',
    deadline: t.deadline,
    recordedAt: '2026-09-30T15:00:00Z',
    status: t.status,
    inspectionId: 1,
    store: {id: t.storeId, name: stores[t.storeId - 1].name},
    fixes: t.fixes.map((f) => ({
      id: f.id,
      description: f.description,
      submittedAt: f.submittedAt,
      review: f.review && {
        decision: f.review.decision,
        comment: f.review.comment,
        reviewedAt: f.review.reviewedAt,
        reviewerName: `${reviewer(f.review.reviewerId).firstName} ${reviewer(f.review.reviewerId).lastName}`,
      },
    })),
  };
}

/** A refusal from the status functions, as Supabase reports it. */
function p0001(message: string) {
  return Object.assign(new Error(message), {code: 'P0001'});
}

/** review_fix in 002_status_functions.sql, on the fake database. */
async function fakeReviewFix(
  fixId: number,
  reviewerId: string,
  decision: ReviewDecision,
  comment: string | null,
) {
  const t = [...db.values()].find((x) => x.fixes.some((f) => f.id === fixId))!;
  if (t.status !== 'pending_review') {
    throw p0001('This ticket has no fix waiting for review');
  }
  t.fixes.find((f) => f.id === fixId)!.review = {
    decision,
    comment,
    reviewedAt: '2026-10-14T16:00:00Z',
    reviewerId,
  };
  t.status = decision === 'approved' ? 'resolved' : decision;
}

beforeEach(() => {
  // Stores 1-2 belong to ownerA, store 3 to ownerB.
  db = new Map(
    [
      ticket(1, 1, 'open'),
      ticket(2, 1, 'changes_requested', [fix(10, changesRequested)]),
      ticket(3, 3, 'open'),
      ticket(4, 1, 'pending_review', [fix(11)]),
      ticket(5, 1, 'resolved'),
      // Round 30 failed on visit 20; round 31 is waiting for a result.
      ticket(
        6,
        1,
        'reinspection_scheduled',
        [],
        [reinspection(30, 'failed', 20), reinspection(31)],
      ),
      ticket(7, 2, 'pending_review', [fix(12, changesRequested), fix(13)]),
    ].map((t) => [t.id, t]),
  );
  nextFixId = 100;

  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(storesDb.storeIdForTicket).mockImplementation(
    async (id) => db.get(id)?.storeId ?? null,
  );
  vi.mocked(ticketsDb.getTicket).mockImplementation(async (id) => {
    const t = db.get(id);
    return t ? toRecord(t) : null;
  });
  vi.mocked(ticketsDb.fixPhotoPath).mockImplementation(
    async (ticketId, fixId) =>
      db.get(ticketId)?.fixes.find((f) => f.id === fixId)?.photo ?? null,
  );
  vi.mocked(ticketsDb.latestFixId).mockImplementation(
    async (ticketId) => db.get(ticketId)?.fixes.at(-1)?.id ?? null,
  );
  // The same checks as submit_fix and review_fix in 002_status_functions.sql.
  vi.mocked(ticketsDb.submitFix).mockImplementation(
    async (ticketId, description, photo) => {
      const t = db.get(ticketId)!;
      if (t.status !== 'open' && t.status !== 'changes_requested') {
        throw p0001('This ticket is not waiting for a fix');
      }
      const id = nextFixId++;
      t.fixes.push({
        id,
        description,
        photo,
        submittedAt: '2026-10-14T15:00:00Z',
        review: null,
      });
      t.status = 'pending_review';
      return id;
    },
  );
  vi.mocked(ticketsDb.reviewFix).mockImplementation(fakeReviewFix);
  // review_fix also adds the re-inspection with its date.
  vi.mocked(ticketsDb.scheduleReinspection).mockImplementation(
    async (fixId, reviewerId, comment, scheduledFor) => {
      await fakeReviewFix(fixId, reviewerId, 'reinspection_scheduled', comment);
      const t = [...db.values()].find((x) =>
        x.fixes.some((f) => f.id === fixId),
      )!;
      t.reinspections.push({
        id: 50,
        scheduledFor,
        outcome: 'pending',
        inspectionId: null,
      });
    },
  );

  // Inspection 20 is at store 1, inspection 21 at store 3.
  vi.mocked(storesDb.storeIdForInspection).mockImplementation(
    async (id) =>
      new Map([
        [20, 1],
        [21, 3],
      ]).get(id) ?? null,
  );
  // The same checks as record_reinspection in 003_reinspection_result.sql.
  vi.mocked(ticketsDb.recordReinspection).mockImplementation(
    async (ticketId, reinspectionId, inspectionId, outcome) => {
      const t = db.get(ticketId)!;
      const round = t.reinspections.find(
        (r) => r.id === reinspectionId && r.outcome === 'pending',
      );
      if (t.status !== 'reinspection_scheduled' || !round) {
        throw p0001('This ticket has no re-inspection scheduled');
      }
      round.outcome = outcome;
      round.inspectionId = inspectionId;
      t.status = outcome === 'passed' ? 'resolved' : 'changes_requested';
    },
  );
});

function submitFix(
  ticketId: number,
  user: Parameters<typeof asUser>[0],
  {
    description = 'Moved the chicken to the bottom shelf.',
    photo = png as Buffer | null,
    filename = 'fix.png',
  } = {},
) {
  const req = request(app)
    .post(`/api/tickets/${ticketId}/fixes`)
    .set(asUser(user))
    .field('description', description);
  return photo ? req.attach('photo', photo, filename) : req;
}

function review(
  ticketId: number,
  user: Parameters<typeof asUser>[0],
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/tickets/${ticketId}/review`)
    .set(asUser(user))
    .send(body);
}

describe('GET /api/tickets/:ticketId', () => {
  it('shows an owner their ticket with every fix round and review', async () => {
    const res = await request(app).get('/api/tickets/2').set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 2,
      status: 'changes_requested',
      overdue: false,
      store: {id: 1, name: 'Main St Diner'},
      fixes: [
        {
          id: 10,
          review: {
            decision: 'changes_requested',
            comment: 'Move the chicken to the bottom shelf.',
            reviewerName: 'Ina Spector',
          },
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain('.png');
  });

  it('shows any ticket to an inspector', async () => {
    const res = await request(app)
      .get('/api/tickets/3')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
  });

  it("refuses another owner's ticket", async () => {
    const res = await request(app).get('/api/tickets/3').set(asUser('ownerA'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });

  it('sends 404 for a ticket that does not exist', async () => {
    const res = await request(app)
      .get('/api/tickets/99')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Ticket not found'});
  });

  it('marks a ticket overdue once its deadline has passed', async () => {
    db.get(1)!.deadline = '2000-01-01';
    const res = await request(app).get('/api/tickets/1').set(asUser('ownerA'));
    expect(res.body.overdue).toBe(true);
  });

  it('refuses a request that is not logged in', async () => {
    const res = await request(app).get('/api/tickets/1');
    expect(res.status).toBe(401);
  });
});

describe('fix photo links', () => {
  it("gives a signed link to a fix's photo", async () => {
    const res = await request(app)
      .get('/api/tickets/2/fixes/10/photo')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({url: 'https://signed.test/fixes/10.png'});
  });

  it('does not give a link to a fix on a different ticket', async () => {
    const res = await request(app)
      .get('/api/tickets/1/fixes/10/photo')
      .set(asUser('ownerA'));
    expect(res.status).toBe(404);
  });

  it("refuses a link to another owner's fix photo", async () => {
    const res = await request(app)
      .get('/api/tickets/3/fixes/1/photo')
      .set(asUser('ownerA'));
    expect(res.status).toBe(403);
    expect(signedPhotoUrl).not.toHaveBeenCalled();
  });
});

describe('POST /api/tickets/:ticketId/fixes (story 9)', () => {
  it('saves the fix and makes an Open ticket Pending review (AC 9.1)', async () => {
    const res = await submitFix(1, 'ownerA');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.fixes).toMatchObject([
      {description: 'Moved the chicken to the bottom shelf.', review: null},
    ]);
    expect(uploadPhoto).toHaveBeenCalledWith(
      'fixes',
      expect.objectContaining({mimeType: 'image/png'}),
    );
    expect(ticketsDb.submitFix).toHaveBeenCalledWith(
      1,
      'Moved the chicken to the bottom shelf.',
      'fixes/new.png',
    );
  });

  it('trims the description', async () => {
    await submitFix(1, 'ownerA', {description: '  Cleaned the sink.  '});
    expect(ticketsDb.submitFix).toHaveBeenCalledWith(
      1,
      'Cleaned the sink.',
      'fixes/new.png',
    );
  });

  it('adds a new round alongside the earlier ones after changes were requested (AC 9.2)', async () => {
    const res = await submitFix(2, 'ownerA', {description: 'Second try'});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_review');
    expect(res.body.fixes).toHaveLength(2);
    expect(res.body.fixes[0]).toMatchObject({
      id: 10,
      review: {decision: 'changes_requested'},
    });
    expect(res.body.fixes[1]).toMatchObject({
      description: 'Second try',
      review: null,
    });
  });

  it.each([4, 5, 6])(
    'refuses ticket %i, which is not waiting for a fix, and saves nothing (AC 9.3)',
    async (ticketId) => {
      const before = db.get(ticketId)!.status;
      const res = await submitFix(ticketId, 'ownerA');
      expect(res.status).toBe(409);
      expect(res.body).toEqual({error: 'This ticket is not waiting for a fix'});
      expect(uploadPhoto).not.toHaveBeenCalled();
      expect(ticketsDb.submitFix).not.toHaveBeenCalled();
      expect(db.get(ticketId)!.status).toBe(before);
    },
  );

  it('removes the uploaded photo if the status changed in the meantime (AC 9.3)', async () => {
    vi.mocked(ticketsDb.submitFix).mockRejectedValueOnce(
      p0001('This ticket is not waiting for a fix'),
    );
    const res = await submitFix(1, 'ownerA');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: 'This ticket is not waiting for a fix'});
    expect(deletePhoto).toHaveBeenCalledWith('fixes/new.png');
  });

  it('refuses a missing photo and saves nothing (AC 9.4)', async () => {
    const res = await submitFix(1, 'ownerA', {photo: null});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'A photo is required',
      fields: {photo: 'A photo is required'},
    });
    expect(ticketsDb.submitFix).not.toHaveBeenCalled();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a JPEG or PNG, whatever its name (AC 9.4)', async () => {
    const res = await submitFix(1, 'ownerA', {
      photo: Buffer.from('GIF89a not really'),
      filename: 'fix.png',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      photo: 'Photo must be a JPEG or PNG image',
    });
    expect(ticketsDb.submitFix).not.toHaveBeenCalled();
  });

  it.each(['', '   '])(
    'refuses description %j and saves nothing (AC 9.4)',
    async (description) => {
      const res = await submitFix(1, 'ownerA', {description});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Description is required',
        fields: {description: 'Description is required'},
      });
      expect(ticketsDb.submitFix).not.toHaveBeenCalled();
      expect(uploadPhoto).not.toHaveBeenCalled();
    },
  );

  it('reports an empty description and a missing photo together (AC 9.4)', async () => {
    const res = await submitFix(1, 'ownerA', {description: '', photo: null});
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      description: 'Description is required',
      photo: 'A photo is required',
    });
  });

  it("refuses a fix for another owner's ticket and saves nothing (AC 9.5)", async () => {
    const res = await submitFix(3, 'ownerA');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(ticketsDb.submitFix).not.toHaveBeenCalled();
    expect(db.get(3)!.status).toBe('open');
  });

  it('refuses a fix from an inspector and saves nothing (AC 9.6)', async () => {
    const res = await submitFix(1, 'inspector');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(ticketsDb.submitFix).not.toHaveBeenCalled();
  });

  it('refuses a fix with no login', async () => {
    const res = await request(app)
      .post('/api/tickets/1/fixes')
      .field('description', 'x');
    expect(res.status).toBe(401);
  });

  it('sends 404 for a ticket that does not exist', async () => {
    const res = await submitFix(99, 'ownerA');
    expect(res.status).toBe(404);
  });
});

function recordResult(
  ticketId: number,
  user: Parameters<typeof asUser>[0],
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/tickets/${ticketId}/reinspection`)
    .set(asUser(user))
    .send(body);
}

describe('POST /api/tickets/:ticketId/review: approve (story 10)', () => {
  it('saves the review with the inspector and time, and resolves the ticket (AC 10.1)', async () => {
    const res = await review(4, 'inspector2', {decision: 'approved'});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.overdue).toBe(false);
    expect(res.body.fixes[0].review).toEqual({
      decision: 'approved',
      comment: null,
      reviewedAt: '2026-10-14T16:00:00Z',
      reviewerName: 'Ivan Checks',
    });
    expect(ticketsDb.reviewFix).toHaveBeenCalledWith(
      11,
      users.inspector2.id,
      'approved',
      null,
    );
  });

  it('reviews the latest fix round (AC 10.1)', async () => {
    await review(7, 'inspector', {decision: 'approved'});
    expect(ticketsDb.reviewFix).toHaveBeenCalledWith(
      13,
      users.inspector.id,
      'approved',
      null,
    );
  });

  it('keeps an optional comment on an approval', async () => {
    await review(4, 'inspector', {decision: 'approved', comment: ' Good. '});
    expect(ticketsDb.reviewFix).toHaveBeenCalledWith(
      11,
      users.inspector.id,
      'approved',
      'Good.',
    );
  });

  it.each([1, 2, 5, 6])(
    'changes nothing on ticket %i, which is not Pending review (AC 10.2)',
    async (ticketId) => {
      const before = db.get(ticketId)!.status;
      const res = await review(ticketId, 'inspector', {decision: 'approved'});
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'This ticket has no fix waiting for review',
      });
      expect(ticketsDb.reviewFix).not.toHaveBeenCalled();
      expect(db.get(ticketId)!.status).toBe(before);
    },
  );

  it('passes on the refusal if the status changed in the meantime (AC 10.2)', async () => {
    vi.mocked(ticketsDb.reviewFix).mockRejectedValueOnce(
      p0001('This ticket has no fix waiting for review'),
    );
    const res = await review(4, 'inspector', {decision: 'approved'});
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'This ticket has no fix waiting for review',
    });
  });

  it('refuses an approval from a store owner and changes nothing (AC 10.3)', async () => {
    const res = await review(4, 'ownerA', {decision: 'approved'});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(ticketsDb.reviewFix).not.toHaveBeenCalled();
    expect(db.get(4)!.status).toBe('pending_review');
  });

  it('refuses an unknown decision', async () => {
    const res = await review(4, 'inspector', {decision: 'maybe'});
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('decision');
    expect(ticketsDb.reviewFix).not.toHaveBeenCalled();
  });
});

describe('POST /api/tickets/:ticketId/review: request changes (story 11)', () => {
  it('saves the review and comment and marks the ticket Changes requested (AC 11.1)', async () => {
    const res = await review(4, 'inspector', {
      decision: 'changes_requested',
      comment: 'The sink is still dirty.',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('changes_requested');
    expect(res.body.fixes[0].review).toMatchObject({
      decision: 'changes_requested',
      comment: 'The sink is still dirty.',
      reviewerName: 'Ina Spector',
    });
  });

  it.each([undefined, '', '   '])(
    'refuses comment %j, marks the comment field and saves nothing (AC 11.2)',
    async (comment) => {
      const res = await review(4, 'inspector', {
        decision: 'changes_requested',
        comment,
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'A comment is required to request changes',
        fields: {comment: 'A comment is required to request changes'},
      });
      expect(ticketsDb.reviewFix).not.toHaveBeenCalled();
      expect(db.get(4)!.status).toBe('pending_review');
    },
  );

  it('lets the owner see the comment and submit another fix (AC 11.3)', async () => {
    await review(4, 'inspector', {
      decision: 'changes_requested',
      comment: 'The sink is still dirty.',
    });
    const seen = await request(app).get('/api/tickets/4').set(asUser('ownerA'));
    expect(seen.body.fixes.at(-1).review.comment).toBe(
      'The sink is still dirty.',
    );
    const again = await submitFix(4, 'ownerA');
    expect(again.status).toBe(201);
    expect(again.body.fixes).toHaveLength(2);
  });

  it('refuses a request for changes from a store owner', async () => {
    const res = await review(4, 'ownerA', {
      decision: 'changes_requested',
      comment: 'x',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/tickets/:ticketId/review: schedule a re-inspection (story 12)', () => {
  it('schedules a re-inspection with the inspector, time and date (AC 12.1)', async () => {
    const res = await review(4, 'inspector', {
      decision: 'reinspection_scheduled',
      scheduledFor: '2999-01-01',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reinspection_scheduled');
    expect(res.body.fixes[0].review).toEqual({
      decision: 'reinspection_scheduled',
      comment: null,
      reviewedAt: '2026-10-14T16:00:00Z',
      reviewerName: 'Ina Spector',
    });
    expect(ticketsDb.scheduleReinspection).toHaveBeenCalledWith(
      11,
      users.inspector.id,
      null,
      '2999-01-01',
    );
    expect(db.get(4)!.reinspections).toEqual([
      {
        id: 50,
        scheduledFor: '2999-01-01',
        outcome: 'pending',
        inspectionId: null,
      },
    ]);
    expect(ticketsDb.reviewFix).not.toHaveBeenCalled();
  });

  it('refuses a schedule with no date and saves nothing (AC 12.1)', async () => {
    const res = await review(4, 'inspector', {
      decision: 'reinspection_scheduled',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'A re-inspection date is required',
      fields: {scheduledFor: 'A re-inspection date is required'},
    });
    expect(ticketsDb.scheduleReinspection).not.toHaveBeenCalled();
    expect(db.get(4)!.status).toBe('pending_review');
  });

  it('refuses a re-inspection date in the past (AC 12.1)', async () => {
    const res = await review(4, 'inspector', {
      decision: 'reinspection_scheduled',
      scheduledFor: '2000-01-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      scheduledFor: 'Re-inspection date cannot be in the past',
    });
    expect(ticketsDb.scheduleReinspection).not.toHaveBeenCalled();
  });

  it.each([1, 2, 5, 6])(
    'changes nothing when scheduling a re-inspection on ticket %i, which is not Pending review (AC 12.5)',
    async (ticketId) => {
      const before = db.get(ticketId)!.status;
      const res = await review(ticketId, 'inspector', {
        decision: 'reinspection_scheduled',
        scheduledFor: '2999-01-01',
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'This ticket has no fix waiting for review',
      });
      expect(ticketsDb.scheduleReinspection).not.toHaveBeenCalled();
      expect(db.get(ticketId)!.status).toBe(before);
    },
  );

  it('refuses a schedule from a store owner and changes nothing (AC 12.6)', async () => {
    const res = await review(4, 'ownerA', {
      decision: 'reinspection_scheduled',
      scheduledFor: '2999-01-01',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(ticketsDb.scheduleReinspection).not.toHaveBeenCalled();
    expect(db.get(4)!.status).toBe('pending_review');
  });
});

describe('POST /api/tickets/:ticketId/reinspection (story 12)', () => {
  it('records a passed re-inspection and resolves the ticket (AC 12.2)', async () => {
    const res = await recordResult(6, 'inspector2', {
      reinspectionId: 31,
      inspectionId: 20,
      outcome: 'passed',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(ticketsDb.recordReinspection).toHaveBeenCalledWith(
      6,
      31,
      20,
      'passed',
    );
    expect(db.get(6)!.reinspections[1]).toMatchObject({
      outcome: 'passed',
      inspectionId: 20,
    });
  });

  it('refuses a result from an inspection of another store (AC 12.2)', async () => {
    const res = await recordResult(6, 'inspector', {
      reinspectionId: 31,
      inspectionId: 21,
      outcome: 'passed',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "This inspection is not of the ticket's store",
    });
    expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
    expect(db.get(6)!.status).toBe('reinspection_scheduled');
  });

  it('refuses a result for an earlier re-inspection round and changes nothing (AC 12.2)', async () => {
    const res = await recordResult(6, 'inspector', {
      reinspectionId: 30,
      inspectionId: 20,
      outcome: 'passed',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'This ticket has no re-inspection scheduled',
    });
    expect(ticketsDb.recordReinspection).toHaveBeenCalledWith(
      6,
      30,
      20,
      'passed',
    );
    expect(db.get(6)!.status).toBe('reinspection_scheduled');
    expect(db.get(6)!.reinspections.map((r) => r.outcome)).toEqual([
      'failed',
      'pending',
    ]);
  });

  it.each([1, 4, 5])(
    'refuses a result for ticket %i, which has no re-inspection scheduled (AC 12.2)',
    async (ticketId) => {
      const before = db.get(ticketId)!.status;
      const res = await recordResult(ticketId, 'inspector', {
        reinspectionId: 31,
        inspectionId: 20,
        outcome: 'passed',
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'This ticket has no re-inspection scheduled',
      });
      expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
      expect(db.get(ticketId)!.status).toBe(before);
    },
  );

  it('records a failed re-inspection and the owner can submit another fix (AC 12.3)', async () => {
    const res = await recordResult(6, 'inspector', {
      reinspectionId: 31,
      inspectionId: 20,
      outcome: 'failed',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('changes_requested');
    expect(ticketsDb.recordReinspection).toHaveBeenCalledWith(
      6,
      31,
      20,
      'failed',
    );
    expect(db.get(6)!.reinspections[1]).toMatchObject({
      outcome: 'failed',
      inspectionId: 20,
    });
    const again = await submitFix(6, 'ownerA');
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('pending_review');
  });

  it('refuses a re-inspection result from a store owner and changes nothing (AC 12.6)', async () => {
    const res = await recordResult(6, 'ownerA', {
      reinspectionId: 31,
      inspectionId: 20,
      outcome: 'passed',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
    expect(db.get(6)!.status).toBe('reinspection_scheduled');
  });

  it('refuses a result with no login', async () => {
    const res = await request(app)
      .post('/api/tickets/6/reinspection')
      .send({reinspectionId: 31, inspectionId: 20, outcome: 'passed'});
    expect(res.status).toBe(401);
    expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
  });

  it('refuses an unknown result', async () => {
    const res = await recordResult(6, 'inspector', {
      reinspectionId: 31,
      inspectionId: 20,
      outcome: 'maybe',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({
      outcome: 'Result must be passed or failed',
    });
    expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
  });

  it('sends 404 for an inspection that does not exist', async () => {
    const res = await recordResult(6, 'inspector', {
      reinspectionId: 31,
      inspectionId: 99,
      outcome: 'passed',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Inspection not found'});
    expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
  });

  it('sends 404 for a ticket that does not exist', async () => {
    const res = await recordResult(99, 'inspector', {
      reinspectionId: 31,
      inspectionId: 20,
      outcome: 'passed',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Ticket not found'});
  });
});
