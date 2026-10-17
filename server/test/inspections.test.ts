import request from 'supertest';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import * as inspectionsDb from '../src/db/inspections.js';
import * as storesDb from '../src/db/stores.js';
import * as ticketsDb from '../src/db/tickets.js';
import type {Severity, Ticket} from '../src/db/types.js';
import * as photos from '../src/lib/photos.js';
import {today} from '../src/lib/validate.js';
import {asUser} from './helpers/auth.js';
import {stores, users, type UserKey} from './helpers/users.js';

vi.mock('../src/db/stores.js');
vi.mock('../src/db/inspections.js');
vi.mock('../src/db/tickets.js');
// Real upload parsing and checks; only Storage itself is mocked.
vi.mock('../src/lib/photos.js', async (importOriginal) => ({
  ...(await importOriginal<typeof photos>()),
  uploadPhoto: vi.fn(async () => 'tickets/abc.png'),
  deletePhoto: vi.fn(async () => {}),
  signedPhotoUrl: vi.fn(async () => 'https://example.test/signed.png'),
}));

const startedAt = '2026-10-14T14:05:00.000Z';

/** Inspection 7, started by the inspector at store 1. */
const inspection = {
  id: 7,
  startedAt,
  storeId: 1,
  inspectorId: users.inspector.id,
};

const recordedAt = '2026-10-15T15:30:00.000Z';

const finding: {description: string; severity: Severity; deadline: string} = {
  description: 'Raw chicken stored above salad',
  severity: 'high',
  deadline: '2099-01-15',
};

/** Ticket 12, the finding above recorded on inspection 7. */
const ticket: Ticket = {
  id: 12,
  ...finding,
  recordedAt,
  status: 'open',
  inspectionId: 7,
};

// 1×1 images, small enough to inline.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const jpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

interface Photo {
  buffer: Buffer;
  filename: string;
  contentType?: string;
}

/** Sends a finding as multipart, the way the finding form does. */
function postFinding({
  user = 'inspector',
  inspectionId = '7',
  fields = finding,
  photo = {buffer: png, filename: 'photo.png'},
}: {
  user?: UserKey;
  inspectionId?: string;
  fields?: Record<string, string>;
  photo?: Photo | null;
} = {}) {
  const req = request(app)
    .post(`/api/inspections/${inspectionId}/tickets`)
    .set(asUser(user));
  for (const [name, value] of Object.entries(fields)) req.field(name, value);
  if (photo) {
    const {buffer, ...options} = photo;
    req.attach('photo', buffer, options);
  }
  return req;
}

/** Checks that no photo was stored and no ticket was saved. */
function expectNothingSaved() {
  expect(photos.uploadPhoto).not.toHaveBeenCalled();
  expect(ticketsDb.createTicket).not.toHaveBeenCalled();
}

let nextTicketId: number;

beforeEach(() => {
  nextTicketId = 12;
  vi.mocked(storesDb.getStore).mockImplementation(
    async (id) => stores.find((store) => store.id === id) ?? null,
  );
  vi.mocked(storesDb.storeIdForInspection).mockImplementation(async (id) =>
    id === inspection.id ? inspection.storeId : null,
  );
  vi.mocked(inspectionsDb.createInspection).mockImplementation(
    async (storeId, inspectorId) => ({id: 7, startedAt, storeId, inspectorId}),
  );
  vi.mocked(inspectionsDb.getInspection).mockImplementation(async (id) =>
    id === inspection.id ? inspection : null,
  );
  vi.mocked(ticketsDb.createTicket).mockImplementation(
    async (inspectionId, saved) => ({
      id: nextTicketId++,
      ...saved,
      recordedAt,
      status: 'open',
      inspectionId,
    }),
  );
  vi.mocked(ticketsDb.listTicketsForInspection).mockResolvedValue([]);
  vi.mocked(storesDb.storeIdForTicket).mockImplementation(async (id) =>
    id === ticket.id ? inspection.storeId : null,
  );
  vi.mocked(ticketsDb.getTicketPhoto).mockResolvedValue('tickets/abc.png');
});

describe('POST /api/stores/:storeId/inspections', () => {
  it('saves an inspection with the inspector, the store and the start time (AC 5.1)', async () => {
    const res = await request(app)
      .post('/api/stores/3/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 7,
      startedAt,
      storeId: 3,
      inspectorId: users.inspector.id,
    });
    expect(inspectionsDb.createInspection).toHaveBeenCalledTimes(1);
    expect(inspectionsDb.createInspection).toHaveBeenCalledWith(
      3,
      users.inspector.id,
    );
  });

  it('takes the inspector from the session, not the request body (AC 5.1)', async () => {
    const res = await request(app)
      .post('/api/stores/3/inspections')
      .set(asUser('inspector'))
      .send({inspectorId: users.inspector2.id, storeId: 1});
    expect(res.status).toBe(201);
    expect(inspectionsDb.createInspection).toHaveBeenCalledWith(
      3,
      users.inspector.id,
    );
  });

  it.each([1, 3, 99])(
    'refuses a store owner with "Access denied" and saves nothing, even for their own store (AC 5.2)',
    async (storeId) => {
      const res = await request(app)
        .post(`/api/stores/${storeId}/inspections`)
        .set(asUser('ownerA'));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
      expect(storesDb.getStore).not.toHaveBeenCalled();
    },
  );

  it('sends "Store not found" and saves nothing for a store that does not exist (AC 5.3)', async () => {
    const res = await request(app)
      .post('/api/stores/99/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Store not found'});
    expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
  });

  it('refuses a store ID that is not a number and saves nothing', async () => {
    const res = await request(app)
      .post('/api/stores/abc/inspections')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
  });

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a request that is not logged in and saves nothing (AC 5.4)',
    async (headers) => {
      const res = await request(app)
        .post('/api/stores/3/inspections')
        .set(headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expect(inspectionsDb.createInspection).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/inspections/:inspectionId', () => {
  it('opens an inspection with its store, inspector and start time (AC 5.1)', async () => {
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('inspector2'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...inspection,
      store: stores[0],
      inspector: {firstName: 'Ina', lastName: 'Spector'},
      tickets: [],
    });
  });

  it("opens an inspection of the owner's own store (AC 5.1)", async () => {
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...inspection,
      store: stores[0],
      inspector: {firstName: 'Ina', lastName: 'Spector'},
      tickets: [],
    });
  });

  it("lists the inspection's findings when it is opened (AC 6.1)", async () => {
    const second = {...ticket, id: 13, description: 'No soap at hand sink'};
    vi.mocked(ticketsDb.listTicketsForInspection).mockResolvedValue([
      ticket,
      second,
    ]);
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([ticket, second]);
    expect(ticketsDb.listTicketsForInspection).toHaveBeenCalledWith(7);
  });

  it('refuses to open an inspection when not logged in (AC 5.4)', async () => {
    const res = await request(app).get('/api/inspections/7');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Not logged in'});
  });

  it('sends 404 for an inspection that does not exist', async () => {
    const res = await request(app)
      .get('/api/inspections/99')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Inspection not found'});
  });

  it("refuses an inspection of another owner's store", async () => {
    const res = await request(app)
      .get('/api/inspections/7')
      .set(asUser('ownerB'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });
});

describe('POST /api/inspections/:inspectionId/tickets', () => {
  it('records a finding as an open ticket on the inspection (AC 6.1)', async () => {
    const res = await postFinding({
      fields: {...finding, description: '  Raw chicken stored above salad  '},
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(ticket);
    expect(photos.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(photos.uploadPhoto).toHaveBeenCalledWith(
      'tickets',
      expect.objectContaining({mimeType: 'image/png'}),
    );
    expect(ticketsDb.createTicket).toHaveBeenCalledTimes(1);
    expect(ticketsDb.createTicket).toHaveBeenCalledWith(
      7,
      finding,
      'tickets/abc.png',
    );
  });

  it('accepts a deadline of today (AC 6.1)', async () => {
    const res = await postFinding({
      fields: {...finding, deadline: today()},
      photo: {buffer: jpeg, filename: 'photo.jpg'},
    });
    expect(res.status).toBe(201);
    expect(res.body.deadline).toBe(today());
  });

  it('opens a separate ticket for each finding (AC 6.2)', async () => {
    const first = await postFinding();
    const second = await postFinding({
      fields: {...finding, description: 'No soap at hand sink'},
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(12);
    expect(second.body.id).toBe(13);
    expect(photos.uploadPhoto).toHaveBeenCalledTimes(2);
    expect(ticketsDb.createTicket).toHaveBeenCalledTimes(2);
  });

  it('refuses a finding without a photo and saves nothing (AC 6.3)', async () => {
    const res = await postFinding({photo: null});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({error: 'A photo is required'});
    expectNothingSaved();
  });

  it('refuses a past deadline and saves nothing (AC 6.4)', async () => {
    const res = await postFinding({
      fields: {...finding, deadline: '2020-01-01'},
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Deadline cannot be in the past',
      fields: {deadline: 'Deadline cannot be in the past'},
    });
    expectNothingSaved();
  });

  it.each([
    {
      buffer: Buffer.from('%PDF-1.4\n'),
      filename: 'notes.pdf',
      contentType: 'application/pdf',
    },
    {
      buffer: Buffer.from('definitely not an image'),
      filename: 'fake.jpg',
      contentType: 'image/jpeg',
    },
  ])(
    'refuses a file that is not a JPEG or PNG and stores no file (AC 6.5)',
    async (photo) => {
      const res = await postFinding({photo});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({error: 'Photo must be a JPEG or PNG image'});
      expectNothingSaved();
    },
  );

  it.each(['', '   '])(
    'refuses a blank description and saves nothing (AC 6.6)',
    async (description) => {
      const res = await postFinding({fields: {...finding, description}});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Description is required',
        fields: {description: 'Description is required'},
      });
      expectNothingSaved();
    },
  );

  it.each([
    {description: finding.description, deadline: finding.deadline},
    {...finding, severity: 'urgent'},
  ])(
    'refuses a missing or unknown severity and saves nothing (AC 6.7)',
    async (fields) => {
      const res = await postFinding({fields});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Severity is required',
        fields: {severity: 'Severity is required'},
      });
      expectNothingSaved();
    },
  );

  it.each([
    {user: 'ownerA', inspectionId: '7'},
    {user: 'ownerB', inspectionId: '7'},
    {user: 'ownerA', inspectionId: '99'},
  ] as const)(
    'refuses a store owner with "Access denied" and saves no finding, ticket or file (AC 6.8)',
    async ({user, inspectionId}) => {
      const res = await postFinding({user, inspectionId});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({error: 'Access denied'});
      expectNothingSaved();
      expect(storesDb.storeIdForInspection).not.toHaveBeenCalled();
    },
  );

  it('refuses a photo over 4 MB with "Photo is too large" and stores nothing (AC 6.9)', async () => {
    const res = await postFinding({
      photo: {
        buffer: Buffer.alloc(photos.MAX_PHOTO_BYTES + 1),
        filename: 'big.png',
      },
    });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({error: 'Photo is too large'});
    expectNothingSaved();
  });

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a finding that is not logged in and saves nothing',
    async (headers) => {
      const res = await request(app)
        .post('/api/inspections/7/tickets')
        .set(headers)
        .field(finding)
        .attach('photo', png, 'photo.png');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expectNothingSaved();
    },
  );

  it('sends "Inspection not found" and saves nothing for an inspection that does not exist', async () => {
    const res = await postFinding({inspectionId: '99'});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Inspection not found'});
    expectNothingSaved();
  });

  it('refuses an inspection ID that is not a number and saves nothing', async () => {
    const res = await postFinding({inspectionId: 'abc'});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expectNothingSaved();
  });

  it('removes the stored photo when the ticket cannot be saved', async () => {
    vi.mocked(ticketsDb.createTicket).mockRejectedValueOnce({
      code: '23503',
      message: 'insert or update on table "ticket" violates foreign key',
    });
    const res = await postFinding();
    expect(res.status).toBe(409);
    expect(photos.deletePhoto).toHaveBeenCalledWith('tickets/abc.png');
  });

  // A re-inspection visit is an ordinary inspection of the store.
  it('opens a new ticket for a finding on a re-inspection visit and changes no other ticket (AC 12.4)', async () => {
    const res = await postFinding();
    expect(res.status).toBe(201);
    expect(ticketsDb.createTicket).toHaveBeenCalledTimes(1);
    expect(ticketsDb.submitFix).not.toHaveBeenCalled();
    expect(ticketsDb.reviewFix).not.toHaveBeenCalled();
    expect(ticketsDb.scheduleReinspection).not.toHaveBeenCalled();
    expect(ticketsDb.recordReinspection).not.toHaveBeenCalled();
  });
});

describe('GET /api/tickets/:ticketId/photo', () => {
  /** Checks that the photo path was not read and no link was made. */
  function expectNoLink() {
    expect(ticketsDb.getTicketPhoto).not.toHaveBeenCalled();
    expect(photos.signedPhotoUrl).not.toHaveBeenCalled();
  }

  it.each(['inspector', 'inspector2'] as const)(
    "sends an inspector a link to a finding's photo (AC 7.1)",
    async (user) => {
      const res = await request(app)
        .get('/api/tickets/12/photo')
        .set(asUser(user));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({url: 'https://example.test/signed.png'});
      expect(ticketsDb.getTicketPhoto).toHaveBeenCalledWith(12);
      expect(photos.signedPhotoUrl).toHaveBeenCalledWith('tickets/abc.png');
    },
  );

  it("sends the store's owner a link to a finding's photo (AC 7.2)", async () => {
    const res = await request(app)
      .get('/api/tickets/12/photo')
      .set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({url: 'https://example.test/signed.png'});
    expect(photos.signedPhotoUrl).toHaveBeenCalledWith('tickets/abc.png');
  });

  it("refuses another owner's photo and sends no photo or link (AC 7.3)", async () => {
    const res = await request(app)
      .get('/api/tickets/12/photo')
      .set(asUser('ownerB'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
    expectNoLink();
  });

  it('sends only a signed link, never the stored path (AC 7.4)', async () => {
    const res = await request(app)
      .get('/api/tickets/12/photo')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['url']);
    expect(res.text).not.toContain('tickets/abc.png');
    expect(photos.signedPhotoUrl).toHaveBeenCalledWith('tickets/abc.png');
  });

  it('sends each finding the link to its own photo (AC 7.1)', async () => {
    vi.mocked(storesDb.storeIdForTicket).mockResolvedValue(inspection.storeId);
    vi.mocked(ticketsDb.getTicketPhoto).mockImplementation(
      async (id) => `tickets/${id}.png`,
    );
    for (const id of [12, 13]) {
      const res = await request(app)
        .get(`/api/tickets/${id}/photo`)
        .set(asUser('inspector'));
      expect(res.status).toBe(200);
      expect(ticketsDb.getTicketPhoto).toHaveBeenLastCalledWith(id);
      expect(photos.signedPhotoUrl).toHaveBeenLastCalledWith(
        `tickets/${id}.png`,
      );
    }
  });

  it.each([null, ''])(
    'sends "Photo not found" and no link for a finding whose photo path is %j (AC 7.1)',
    async (path) => {
      vi.mocked(ticketsDb.getTicketPhoto).mockResolvedValue(path);
      const res = await request(app)
        .get('/api/tickets/12/photo')
        .set(asUser('inspector'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({error: 'Photo not found'});
      expect(photos.signedPhotoUrl).not.toHaveBeenCalled();
    },
  );

  it.each([{}, {Authorization: 'Bearer nonsense'}])(
    'refuses a photo request that is not logged in and sends no link',
    async (headers) => {
      const res = await request(app).get('/api/tickets/12/photo').set(headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({error: 'Not logged in'});
      expectNoLink();
    },
  );

  it('sends "Ticket not found" and no link for a finding that does not exist', async () => {
    const res = await request(app)
      .get('/api/tickets/99/photo')
      .set(asUser('inspector'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Ticket not found'});
    expectNoLink();
  });

  it('refuses a ticket ID that is not a number and sends no link', async () => {
    const res = await request(app)
      .get('/api/tickets/abc/photo')
      .set(asUser('inspector'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid ID');
    expectNoLink();
  });
});
