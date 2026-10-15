import type {InspectionDetail, Store, User} from '../types';

export const inspector: User = {
  id: 'inspector-1',
  firstName: 'Jordan',
  lastName: 'Reyes',
  email: 'inspector1@walkthrough.test',
  role: 'inspector',
};

export const owner: User = {
  id: 'owner-1',
  firstName: 'Sam',
  lastName: 'Carter',
  email: 'owner1@walkthrough.test',
  role: 'store_owner',
};

/** `owner` owns stores 1 and 2; store 3 belongs to another owner. */
export const stores: Store[] = [
  {id: 1, name: 'Main St Diner', address: '1 Main St', ownerId: owner.id},
  {id: 2, name: 'Westport Cafe', address: '2 West St', ownerId: owner.id},
  {id: 3, name: 'River Market', address: '3 River Rd', ownerId: 'owner-2'},
];

/** Inspection 7, started by `inspector` at store 1. */
export const inspection: InspectionDetail = {
  id: 7,
  startedAt: '2026-10-14T14:05:00.000Z',
  storeId: 1,
  inspectorId: inspector.id,
  store: stores[0],
  inspector: {firstName: 'Jordan', lastName: 'Reyes'},
};
