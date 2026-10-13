import {Router} from 'express';
import request from 'supertest';
import {describe, expect, it, vi} from 'vitest';
import {verifyToken} from '../src/lib/auth.js';
import {requireRole, requireUser} from '../src/middleware/auth.js';
import {testApp} from './helpers/app.js';
import {asUser} from './helpers/auth.js';
import {users} from './helpers/users.js';

const router = Router();
router.get(
  '/inspectors-only',
  requireUser,
  requireRole('inspector'),
  (req, res) => {
    res.json({id: req.user?.id});
  },
);
const app = testApp(router);

describe('requireUser', () => {
  it('refuses a request with no Authorization header', async () => {
    const res = await request(app).get('/inspectors-only');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Not logged in'});
  });

  it('refuses an invalid token', async () => {
    const res = await request(app)
      .get('/inspectors-only')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Not logged in'});
  });

  it('refuses a valid token whose user has no app_user row', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce('unknown-user-id');
    const res = await request(app)
      .get('/inspectors-only')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Not logged in'});
  });
});

describe('requireRole', () => {
  it('refuses the wrong role', async () => {
    const res = await request(app)
      .get('/inspectors-only')
      .set(asUser('ownerA'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({error: 'Access denied'});
  });

  it('lets the right role through with req.user set', async () => {
    const res = await request(app)
      .get('/inspectors-only')
      .set(asUser('inspector'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({id: users.inspector.id});
  });
});
