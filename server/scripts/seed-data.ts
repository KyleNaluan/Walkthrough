import type {
  ReviewDecision,
  Severity,
  TicketStatus,
  UserRole,
} from '../src/db/types.js';

/** Every seed account uses this domain; the seed deletes them by it. */
export const SEED_EMAIL_DOMAIN = '@walkthrough.test';

/** The one sample photo every seeded photo column points at. */
export const SEED_PHOTO_PATH = 'seed/sample.png';

export interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface SeedStore {
  name: string;
  address: string;
  ownerEmail: string;
}

export interface SeedInspection {
  key: string;
  storeName: string;
  inspectorEmail: string;
  startedAt: string;
}

export interface SeedReview {
  reviewerEmail: string;
  decision: ReviewDecision;
  comment: string | null;
  reviewedAt: string;
}

export interface SeedFix {
  description: string;
  submittedAt: string;
  review: SeedReview | null;
}

export interface SeedReinspection {
  scheduledFor: string;
  createdAt: string;
  inspectorEmail: string;
}

export interface SeedTicket {
  inspectionKey: string;
  description: string;
  severity: Severity;
  deadline: string;
  recordedAt: string;
  status: TicketStatus;
  fixes: SeedFix[];
  reinspection: SeedReinspection | null;
}

export interface SeedPlan {
  users: SeedUser[];
  stores: SeedStore[];
  inspections: SeedInspection[];
  tickets: SeedTicket[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A YYYY-MM-DD date moved by a number of days. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/**
 * The seed data, with timestamps relative to `now` and deadlines relative to
 * `today` (YYYY-MM-DD), so the data looks current whenever it is run.
 */
export function buildSeedPlan(now: Date, today: string): SeedPlan {
  // A time `days` days and `hours` hours ago.
  const ago = (days: number, hours = 0) =>
    new Date(now.getTime() - days * DAY_MS - hours * 3_600_000).toISOString();
  const inDays = (days: number) => addDays(today, days);

  const inspector1 = `inspector1${SEED_EMAIL_DOMAIN}`;
  const inspector2 = `inspector2${SEED_EMAIL_DOMAIN}`;
  const owner1 = `owner1${SEED_EMAIL_DOMAIN}`;
  const owner2 = `owner2${SEED_EMAIL_DOMAIN}`;
  const owner3 = `owner3${SEED_EMAIL_DOMAIN}`;

  const users: SeedUser[] = [
    {
      email: inspector1,
      firstName: 'Jordan',
      lastName: 'Reyes',
      role: 'inspector',
    },
    {
      email: inspector2,
      firstName: 'Priya',
      lastName: 'Shah',
      role: 'inspector',
    },
    {email: owner1, firstName: 'Sam', lastName: 'Carter', role: 'store_owner'},
    {email: owner2, firstName: 'Lena', lastName: 'Park', role: 'store_owner'},
    {email: owner3, firstName: 'Marcus', lastName: 'Bell', role: 'store_owner'},
  ];

  const crossroads = 'Crossroads Coffee Co.';
  const westport = 'Westport Taqueria';
  const riverMarket = 'River Market Bagels';
  const brookside = 'Brookside Bistro';
  const stores: SeedStore[] = [
    {
      name: crossroads,
      address: '1820 Grand Blvd, Kansas City, MO 64108',
      ownerEmail: owner1,
    },
    {
      name: westport,
      address: '4115 Mill St, Kansas City, MO 64111',
      ownerEmail: owner1,
    },
    {
      name: riverMarket,
      address: '412 Walnut St, Kansas City, MO 64106',
      ownerEmail: owner2,
    },
    {
      name: brookside,
      address: '6330 Brookside Plaza, Kansas City, MO 64113',
      ownerEmail: owner3,
    },
    // Never inspected, for the empty-history and no-tickets states.
    {
      name: '18th Street Smokehouse',
      address: '1608 E 18th St, Kansas City, MO 64108',
      ownerEmail: owner3,
    },
  ];

  const inspections: SeedInspection[] = [
    {
      key: 'crossroads-1',
      storeName: crossroads,
      inspectorEmail: inspector1,
      startedAt: ago(30),
    },
    {
      key: 'crossroads-2',
      storeName: crossroads,
      inspectorEmail: inspector2,
      startedAt: ago(7),
    },
    {
      key: 'westport-1',
      storeName: westport,
      inspectorEmail: inspector1,
      startedAt: ago(20),
    },
    {
      key: 'river-market-1',
      storeName: riverMarket,
      inspectorEmail: inspector2,
      startedAt: ago(14),
    },
    {
      key: 'brookside-1',
      storeName: brookside,
      inspectorEmail: inspector1,
      startedAt: ago(10),
    },
  ];

  const tickets: SeedTicket[] = [
    {
      // Resolved with a past deadline: never shown as overdue.
      inspectionKey: 'crossroads-1',
      description: 'Walk-in cooler holding at 46°F; it must be 41°F or below.',
      severity: 'high',
      deadline: inDays(-23),
      recordedAt: ago(30, -1),
      status: 'resolved',
      fixes: [
        {
          description: 'Replaced the door gasket; the cooler now holds 38°F.',
          submittedAt: ago(26),
          review: {
            reviewerEmail: inspector1,
            decision: 'approved',
            comment: null,
            reviewedAt: ago(25),
          },
        },
      ],
      reinspection: null,
    },
    {
      // Open with a past deadline: overdue.
      inspectionKey: 'crossroads-1',
      description:
        'Hand sink in the back prep area is blocked by stored boxes.',
      severity: 'low',
      deadline: inDays(-5),
      recordedAt: ago(30, -2),
      status: 'open',
      fixes: [],
      reinspection: null,
    },
    {
      inspectionKey: 'crossroads-2',
      description: 'Prepared foods in the reach-in cooler have no date labels.',
      severity: 'medium',
      deadline: inDays(7),
      recordedAt: ago(7, -1),
      status: 'pending_review',
      fixes: [
        {
          description: 'Every container is now labeled with its prep date.',
          submittedAt: ago(1),
          review: null,
        },
      ],
      reinspection: null,
    },
    {
      inspectionKey: 'westport-1',
      description:
        'Raw chicken stored above ready-to-eat produce in the walk-in.',
      severity: 'high',
      deadline: inDays(3),
      recordedAt: ago(20, -1),
      status: 'changes_requested',
      fixes: [
        {
          description: 'Moved the chicken to a separate shelf.',
          submittedAt: ago(15),
          review: {
            reviewerEmail: inspector2,
            decision: 'changes_requested',
            comment:
              'The photo still shows chicken on the top shelf. Store it on the bottom shelf.',
            reviewedAt: ago(14),
          },
        },
      ],
      reinspection: null,
    },
    {
      inspectionKey: 'river-market-1',
      description: 'Sanitizer bucket concentration is below 50 ppm.',
      severity: 'medium',
      deadline: inDays(2),
      recordedAt: ago(14, -1),
      status: 'reinspection_scheduled',
      fixes: [
        {
          description:
            'Bought test strips and retrained staff on mixing sanitizer.',
          submittedAt: ago(10),
          review: {
            reviewerEmail: inspector2,
            decision: 'reinspection_scheduled',
            comment: 'I will check the concentration in person.',
            reviewedAt: ago(9),
          },
        },
      ],
      reinspection: {
        scheduledFor: inDays(5),
        createdAt: ago(9),
        inspectorEmail: inspector2,
      },
    },
    {
      inspectionKey: 'brookside-1',
      description: 'Light shield missing over the prep line.',
      severity: 'low',
      deadline: inDays(14),
      recordedAt: ago(10, -1),
      status: 'open',
      fixes: [],
      reinspection: null,
    },
    {
      // Two fix rounds, for the ticket timeline.
      inspectionKey: 'brookside-1',
      description: 'Grease buildup on the hood filters.',
      severity: 'medium',
      deadline: inDays(10),
      recordedAt: ago(10, -2),
      status: 'pending_review',
      fixes: [
        {
          description: 'Wiped down the hood filters.',
          submittedAt: ago(8),
          review: {
            reviewerEmail: inspector1,
            decision: 'changes_requested',
            comment: 'Wiping is not enough. Soak or replace the filters.',
            reviewedAt: ago(7),
          },
        },
        {
          description: 'Replaced all four hood filters with new ones.',
          submittedAt: ago(2),
          review: null,
        },
      ],
      reinspection: null,
    },
  ];

  return {users, stores, inspections, tickets};
}
