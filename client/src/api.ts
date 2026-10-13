import {clearSession, readSession} from './auth/session';

/** A failed API call, built from the server's `{error, fields}` body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onUnauthorized: (() => void) | undefined;

/** Sets what happens when the server says the user isn't logged in. */
export function setOnUnauthorized(callback: (() => void) | undefined): void {
  onUnauthorized = callback;
}

async function request<T>(
  method: string,
  path: string,
  body?: BodyInit,
  contentType?: string,
): Promise<T> {
  const headers: Record<string, string> = {Accept: 'application/json'};
  const session = readSession();
  if (session) headers.Authorization = `Bearer ${session.token}`;
  if (contentType) headers['Content-Type'] = contentType;

  const res = await fetch(path, {method, headers, body});
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      fields?: Record<string, string>;
    };
    // A logged-in user whose session ended; a failed login is just an error.
    if (res.status === 401 && path !== '/api/auth/login') {
      clearSession();
      onUnauthorized?.();
    }
    throw new ApiError(
      res.status,
      data.error ?? `${method} ${path} failed with ${res.status}`,
      data.fields,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** GETs JSON from the API. Paths are relative, e.g. '/api/stores'. */
export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

/** POSTs a JSON body to the API. */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, JSON.stringify(body), 'application/json');
}

/** POSTs a form with a file; the browser sets the multipart Content-Type. */
export function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return request<T>('POST', path, formData);
}
