import {describe, expect, it} from 'vitest';
import {
  addDays,
  buildSeedPlan,
  SEED_EMAIL_DOMAIN,
  type SeedTicket,
} from '../scripts/seed-data.js';
import type {TicketStatus} from '../src/db/types.js';

const today = '2026-10-12';
const plan = buildSeedPlan(new Date('2026-10-12T17:00:00Z'), today);
const inspectors = new Set(
  plan.users.filter((user) => user.role === 'inspector').map((u) => u.email),
);

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('buildSeedPlan', () => {
  it('has the agreed accounts, all on the seed domain', () => {
    expect(plan.users.map((user) => user.email)).toEqual([
      'inspector1@walkthrough.test',
      'inspector2@walkthrough.test',
      'owner1@walkthrough.test',
      'owner2@walkthrough.test',
      'owner3@walkthrough.test',
    ]);
    for (const user of plan.users) {
      expect(user.email.endsWith(SEED_EMAIL_DOMAIN)).toBe(true);
    }
  });

  it('gives owners 2, 1 and 2 stores, all owned by store owners', () => {
    const count = (email: string) =>
      plan.stores.filter((store) => store.ownerEmail === email).length;
    expect(count('owner1@walkthrough.test')).toBe(2);
    expect(count('owner2@walkthrough.test')).toBe(1);
    expect(count('owner3@walkthrough.test')).toBe(2);
    expect(plan.stores).toHaveLength(5);
    const names = plan.stores.map((store) => `${store.name}|${store.address}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('leaves at least one store with no inspections', () => {
    const inspected = new Set(plan.inspections.map((i) => i.storeName));
    expect(plan.stores.some((store) => !inspected.has(store.name))).toBe(true);
  });

  it('only has inspections by inspectors at stores that exist', () => {
    const storeNames = new Set(plan.stores.map((store) => store.name));
    for (const inspection of plan.inspections) {
      expect(inspectors.has(inspection.inspectorEmail)).toBe(true);
      expect(storeNames.has(inspection.storeName)).toBe(true);
    }
  });

  it('has every ticket status, every severity and an overdue ticket', () => {
    const statuses: TicketStatus[] = [
      'open',
      'pending_review',
      'changes_requested',
      'reinspection_scheduled',
      'resolved',
    ];
    const present = new Set(plan.tickets.map((ticket) => ticket.status));
    expect([...present].sort()).toEqual([...statuses].sort());
    expect(new Set(plan.tickets.map((t) => t.severity))).toEqual(
      new Set(['low', 'medium', 'high']),
    );
    expect(
      plan.tickets.some(
        (ticket) => ticket.deadline < today && ticket.status === 'open',
      ),
    ).toBe(true);
  });

  // The rows the status functions in 002 would have written for each status.
  const lastReview: Record<TicketStatus, string | null | undefined> = {
    open: undefined, // no fix at all
    pending_review: null, // latest fix not reviewed
    changes_requested: 'changes_requested',
    reinspection_scheduled: 'reinspection_scheduled',
    resolved: 'approved',
  };

  it.each(
    plan.tickets.map((ticket): [string, SeedTicket] => [
      ticket.description,
      ticket,
    ]),
  )('ticket "%s" is consistent with its status', (_, ticket) => {
    const inspection = plan.inspections.find(
      (i) => i.key === ticket.inspectionKey,
    );
    expect(inspection).toBeDefined();
    expect(ticket.recordedAt >= inspection!.startedAt).toBe(true);

    const last = ticket.fixes.at(-1);
    expect(last && (last.review?.decision ?? null)).toBe(
      lastReview[ticket.status],
    );
    // Earlier rounds were all sent back with changes requested.
    for (const fix of ticket.fixes.slice(0, -1)) {
      expect(fix.review?.decision).toBe('changes_requested');
    }

    let previous = ticket.recordedAt;
    for (const fix of ticket.fixes) {
      expect(fix.submittedAt > previous).toBe(true);
      previous = fix.submittedAt;
      if (fix.review) {
        expect(inspectors.has(fix.review.reviewerEmail)).toBe(true);
        expect(fix.review.reviewedAt > fix.submittedAt).toBe(true);
        previous = fix.review.reviewedAt;
        if (fix.review.decision === 'changes_requested') {
          expect(fix.review.comment?.trim()).toBeTruthy();
        }
      }
    }

    if (ticket.status === 'reinspection_scheduled') {
      expect(inspectors.has(ticket.reinspection!.inspectorEmail)).toBe(true);
      expect(ticket.reinspection!.scheduledFor >= today).toBe(true);
    } else {
      expect(ticket.reinspection).toBeNull();
    }
  });
});
