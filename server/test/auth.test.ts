import request from 'supertest';
import {describe, expect, it, vi} from 'vitest';
import {app} from '../src/app.js';
import {signIn} from '../src/lib/auth.js';
import {asUser} from './helpers/auth.js';
import {users} from './helpers/users.js';

describe('POST /api/auth/login', () => {
  it('returns a token and the user on success', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: 1_800_000_000,
      userId: users.inspector.id,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({email: ' inspector1@walkthrough.test ', password: 'secret'});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: 'access-token',
      expiresAt: 1_800_000_000,
      user: users.inspector,
    });
    expect(signIn).toHaveBeenLastCalledWith(
      'inspector1@walkthrough.test',
      'secret',
    );
  });

  it('refuses a wrong password or unknown email with one message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({email: 'nobody@walkthrough.test', password: 'wrong'});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Email or password is incorrect'});
  });

  it('refuses an account with no app_user row with the same message', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      accessToken: 'access-token',
      expiresAt: 1_800_000_000,
      userId: 'auth-user-without-app-user',
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({email: 'orphan@walkthrough.test', password: 'secret'});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Email or password is incorrect'});
  });

  it.each([
    [{email: '  ', password: 'secret'}, 'email', 'Email is required'],
    [{email: 'a@b.test', password: ''}, 'password', 'Password is required'],
    [{email: 'a@b.test'}, 'password', 'Password is required'],
  ])('refuses a blank field: %j', async (body, field, message) => {
    vi.mocked(signIn).mockClear();
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({[field]: message});
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('GET /api/me', () => {
  it('returns the logged-in user', async () => {
    const res = await request(app).get('/api/me').set(asUser('ownerA'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(users.ownerA);
  });

  it('refuses a request with no token', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({error: 'Not logged in'});
  });
});
