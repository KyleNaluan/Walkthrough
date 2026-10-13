import {Router} from 'express';
import request from 'supertest';
import {describe, expect, it, vi} from 'vitest';
import {z} from 'zod';
import {HttpError, toHttpError} from '../src/lib/errors.js';
import {testApp} from './helpers/app.js';

describe('toHttpError', () => {
  it.each([
    ['23505', 409, 'Already exists'],
    ['23503', 409, 'A linked record is missing or still in use'],
    ['23514', 400, 'Invalid data'],
    ['23502', 400, 'Invalid data'],
    ['22P02', 400, 'Invalid ID'],
  ])('maps Postgres code %s to %i', (code, status, message) => {
    const mapped = toHttpError({code, message: 'raw database text'});
    expect(mapped).toBeInstanceOf(HttpError);
    expect(mapped).toMatchObject({status, message});
  });

  it('returns undefined for anything else', () => {
    expect(toHttpError({code: 'XX000'})).toBeUndefined();
    expect(toHttpError(new Error('boom'))).toBeUndefined();
    expect(toHttpError(null)).toBeUndefined();
  });
});

describe('errorHandler', () => {
  const router = Router();
  router.get('/http', () => {
    throw new HttpError(404, 'Store not found');
  });
  router.get('/db', () => {
    throw {code: '23505', message: 'duplicate key value'};
  });
  router.post('/zod', (req, res) => {
    res.json(z.object({name: z.string('Name is required')}).parse(req.body));
  });
  router.get('/unknown', () => {
    throw new Error('boom');
  });
  const app = testApp(router);

  it('sends an HttpError with its status', async () => {
    const res = await request(app).get('/http');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({error: 'Store not found'});
  });

  it('sends a mapped database error', async () => {
    const res = await request(app).get('/db');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({error: 'Already exists'});
  });

  it('sends a ZodError as a 400 with the failing fields', async () => {
    const res = await request(app).post('/zod').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Name is required',
      fields: {name: 'Name is required'},
    });
  });

  it('sends a malformed JSON body as a 400', async () => {
    const res = await request(app)
      .post('/zod')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({error: 'Invalid JSON'});
  });

  it('logs anything else and sends a 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({error: 'Internal server error'});
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
