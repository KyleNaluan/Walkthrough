import {describe, expect, it, vi} from 'vitest';
import {ApiError, apiGet, apiPost, apiUpload, setOnUnauthorized} from './api';
import {readSession} from './auth/session';
import {loginAs} from './test/renderWithAuth';
import {owner} from './test/users';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls[0][1].headers as Record<string, string>;
}

describe('api', () => {
  it('sends the token when logged in', async () => {
    loginAs(owner);
    const fetchMock = stubFetch(Response.json({ok: true}));
    await expect(apiGet('/api/stores')).resolves.toEqual({ok: true});
    expect(sentHeaders(fetchMock).Authorization).toBe(
      'Bearer test-token-owner-1',
    );
  });

  it('sends no token when logged out', async () => {
    const fetchMock = stubFetch(Response.json({}));
    await apiGet('/api/health');
    expect(sentHeaders(fetchMock).Authorization).toBeUndefined();
  });

  it('posts JSON', async () => {
    const fetchMock = stubFetch(Response.json({id: 1}, {status: 201}));
    await apiPost('/api/stores/1/inspections', {note: 'x'});
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"note":"x"}');
    expect(sentHeaders(fetchMock)['Content-Type']).toBe('application/json');
  });

  it('uploads a form without setting Content-Type', async () => {
    const fetchMock = stubFetch(Response.json({id: 1}));
    const form = new FormData();
    await apiUpload('/api/inspections/1/tickets', form);
    expect(fetchMock.mock.calls[0][1].body).toBe(form);
    expect(sentHeaders(fetchMock)['Content-Type']).toBeUndefined();
  });

  it('turns the error body into an ApiError', async () => {
    stubFetch(
      Response.json(
        {error: 'Description is required', fields: {description: 'Required'}},
        {status: 400},
      ),
    );
    const error = await apiPost('/api/x', {}).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      message: 'Description is required',
      fields: {description: 'Required'},
    });
  });

  it('clears the session and calls onUnauthorized on a 401', async () => {
    loginAs(owner);
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);
    stubFetch(Response.json({error: 'Not logged in'}, {status: 401}));
    await expect(apiGet('/api/stores')).rejects.toMatchObject({status: 401});
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(readSession()).toBeNull();
    setOnUnauthorized(undefined);
  });

  it('does not treat a refused logout as a lost session', async () => {
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);
    stubFetch(Response.json({error: 'Not logged in'}, {status: 401}));
    await expect(apiPost('/api/auth/logout', {})).rejects.toMatchObject({
      status: 401,
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    setOnUnauthorized(undefined);
  });

  it('does not treat a failed login as a lost session', async () => {
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);
    stubFetch(
      Response.json({error: 'Email or password is incorrect'}, {status: 401}),
    );
    await expect(apiPost('/api/auth/login', {})).rejects.toMatchObject({
      message: 'Email or password is incorrect',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    setOnUnauthorized(undefined);
  });
});
