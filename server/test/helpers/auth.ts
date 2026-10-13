import type {UserKey} from './users.js';

/** Headers that log a request in as a fixture user (see test/setup.ts). */
export function asUser(key: UserKey): {Authorization: string} {
  return {Authorization: `Bearer test-${key}`};
}
