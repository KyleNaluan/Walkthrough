import {describe, expect, it, vi} from 'vitest';
import {owner} from '../test/users';
import {clearSession, readSession, writeSession} from './session';

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

describe('session', () => {
  it('reads back what was written', () => {
    const session = {token: 't', expiresAt: inAnHour(), user: owner};
    writeSession(session);
    expect(readSession()).toEqual(session);
    clearSession();
    expect(readSession()).toBeNull();
  });

  it('ignores an expired token', () => {
    writeSession({token: 't', expiresAt: 1, user: owner});
    expect(readSession()).toBeNull();
  });

  it('ignores a malformed value', () => {
    sessionStorage.setItem('walkthrough.session', '{not json');
    expect(readSession()).toBeNull();
  });

  it('does not crash when sessionStorage throws', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    expect(() =>
      writeSession({token: 't', expiresAt: inAnHour(), user: owner}),
    ).not.toThrow();
    expect(readSession()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });
});
