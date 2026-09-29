/** Fetches JSON from the Express API. Paths are relative, e.g. '/api/health'. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {headers: {Accept: 'application/json'}});
  if (!res.ok) {
    throw new Error(`GET ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}
