import {vi} from 'vitest';

/**
 * Stubs fetch with one answer per API path: a JSON body (sent with 200), a
 * Response, or a function called for each request that returns either. Any
 * other path gets a 404 like the server's.
 */
export function stubApi(routes: Record<string, unknown>) {
  const fetch = vi.fn(async (path: string, _init?: RequestInit) => {
    const route = routes[path];
    const answer = typeof route === 'function' ? route() : route;
    if (answer === undefined) {
      return Response.json({error: 'Not found'}, {status: 404});
    }
    return answer instanceof Response ? answer.clone() : Response.json(answer);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
