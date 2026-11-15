import {describe, expect, it} from 'vitest';
import type {TicketStatus} from '../src/db/types.js';
import {summarizeStore} from '../src/lib/summary.js';
import {today} from '../src/lib/validate.js';

const PAST = '2000-01-01';
const FUTURE = '2999-01-01';

const ticket = (status: TicketStatus, deadline = FUTURE) => ({
  status,
  deadline,
});

describe('summarizeStore (story 20)', () => {
  it('counts every status except resolved as open (AC 20.1)', () => {
    const summary = summarizeStore(
      [
        ticket('open'),
        ticket('pending_review'),
        ticket('changes_requested'),
        ticket('reinspection_scheduled'),
        ticket('resolved'),
      ],
      [],
    );
    expect(summary.openTickets).toBe(4);
  });

  it('counts only open tickets past their deadline as overdue (AC 20.1)', () => {
    const summary = summarizeStore(
      [
        ticket('open', PAST),
        ticket('changes_requested', PAST),
        ticket('open', today()), // due today: not overdue yet
        ticket('open', FUTURE),
        ticket('resolved', PAST), // resolved: never overdue
      ],
      [],
    );
    expect(summary.overdueTickets).toBe(2);
    expect(summary.openTickets).toBe(4);
  });

  it('takes the most recently started inspection (AC 20.1)', () => {
    const summary = summarizeStore(
      [],
      [
        {id: 7, startedAt: '2026-09-30T15:00:00.000Z', completedAt: null},
        {
          id: 9,
          startedAt: '2026-10-20T15:00:00.000Z',
          completedAt: '2026-10-20T16:00:00.000Z',
        },
        {id: 8, startedAt: '2026-10-14T15:00:00.000Z', completedAt: null},
      ],
    );
    expect(summary.lastInspection).toEqual({
      id: 9,
      startedAt: '2026-10-20T15:00:00.000Z',
      completedAt: '2026-10-20T16:00:00.000Z',
    });
  });

  it('keeps an inspection that is still in progress (AC 20.1)', () => {
    const summary = summarizeStore(
      [],
      [{id: 3, startedAt: '2026-11-01T15:00:00.000Z', completedAt: null}],
    );
    expect(summary.lastInspection?.completedAt).toBeNull();
  });

  it('is zero, zero and no inspection for a store never inspected (AC 20.2)', () => {
    expect(summarizeStore([], [])).toEqual({
      openTickets: 0,
      overdueTickets: 0,
      lastInspection: null,
    });
  });

  it('does not count resolved tickets as open (AC 20.1)', () => {
    const summary = summarizeStore(
      [ticket('resolved', PAST), ticket('resolved')],
      [],
    );
    expect(summary).toMatchObject({openTickets: 0, overdueTickets: 0});
  });
});
