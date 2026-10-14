import {vi} from 'vitest';

/**
 * Stubs fetch with one answer per API path: a JSON body (sent with 200) or
 * a Response. Any other path gets a 404 like the server's.
 */
export function stubApi(routes: Record<string, unknown>) {
  const fetch = vi.fn(async (path: string) => {
    const answer = routes[path];
    if (answer === undefined) {
      return Response.json({error: 'Not found'}, {status: 404});
    }
    return answer instanceof Response ? answer.clone() : Response.json(answer);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
