import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  idParam,
  isOverdue,
  nonBlank,
  notInPast,
  today,
} from '../src/lib/validate.js';

describe('dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 03:00 UTC is still the evening before in Kansas City.
    vi.setSystemTime(new Date('2026-10-13T03:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('today() is the Chicago date, not the UTC date', () => {
    expect(today()).toBe('2026-10-12');
  });

  it('notInPast accepts today and later, and refuses earlier dates', () => {
    const deadline = notInPast('Deadline');
    expect(deadline.safeParse('2026-10-12').success).toBe(true);
    expect(deadline.safeParse('2026-12-01').success).toBe(true);
    const past = deadline.safeParse('2026-10-11');
    expect(past.error?.issues[0].message).toBe(
      'Deadline cannot be in the past',
    );
    expect(deadline.safeParse('not a date').success).toBe(false);
  });

  it('isOverdue is true only for a past deadline on an unresolved ticket', () => {
    expect(isOverdue('2026-10-11', 'open')).toBe(true);
    expect(isOverdue('2026-10-11', 'resolved')).toBe(false);
    expect(isOverdue('2026-10-12', 'open')).toBe(false);
  });
});

describe('nonBlank', () => {
  const description = nonBlank('Description');

  it('trims the value', () => {
    expect(description.parse('  Leaky sink ')).toBe('Leaky sink');
  });

  it.each([undefined, '', '   '])('refuses %j', (value) => {
    const result = description.safeParse(value);
    expect(result.error?.issues[0].message).toBe('Description is required');
  });
});

describe('idParam', () => {
  it('coerces a positive whole number', () => {
    expect(idParam.parse('42')).toBe(42);
  });

  it.each(['0', '-1', '1.5', 'abc', ''])('refuses %j', (value) => {
    expect(idParam.safeParse(value).success).toBe(false);
  });
});
