import type {AppUser, Store} from '../../src/db/types.js';

/** Test users. ownerA owns stores 1 and 2, ownerB owns store 3. */
export const users = {
  inspector: {
    id: '00000000-0000-4000-8000-000000000001',
    firstName: 'Ina',
    lastName: 'Spector',
    email: 'inspector1@walkthrough.test',
    role: 'inspector',
  },
  inspector2: {
    id: '00000000-0000-4000-8000-000000000002',
    firstName: 'Ivan',
    lastName: 'Checks',
    email: 'inspector2@walkthrough.test',
    role: 'inspector',
  },
  ownerA: {
    id: '00000000-0000-4000-8000-00000000000a',
    firstName: 'Olivia',
    lastName: 'Owner',
    email: 'owner1@walkthrough.test',
    role: 'store_owner',
  },
  ownerB: {
    id: '00000000-0000-4000-8000-00000000000b',
    firstName: 'Omar',
    lastName: 'Other',
    email: 'owner2@walkthrough.test',
    role: 'store_owner',
  },
} satisfies Record<string, AppUser>;

export type UserKey = keyof typeof users;

export const stores: Store[] = [
  {
    id: 1,
    name: 'Main St Diner',
    address: '1 Main St',
    ownerId: users.ownerA.id,
  },
  {
    id: 2,
    name: 'Westport Cafe',
    address: '2 West St',
    ownerId: users.ownerA.id,
  },
  {
    id: 3,
    name: 'River Market',
    address: '3 River Rd',
    ownerId: users.ownerB.id,
  },
];

/** The fixture with this user ID, if any. */
export function findUser(id: string): AppUser | null {
  return Object.values(users).find((user) => user.id === id) ?? null;
}
