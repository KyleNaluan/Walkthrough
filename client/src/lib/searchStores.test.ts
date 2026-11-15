import {describe, expect, it} from 'vitest';
import {stores} from '../test/users';
import {searchStores} from './searchStores';

// Main St Diner / 1 Main St, Westport Cafe / 2 West St, River Market / 3 River Rd.
const names = (query: string) =>
  searchStores(stores, query).map((store) => store.name);

describe('searchStores (story 19)', () => {
  it('matches part of a name in any case (AC 19.1)', () => {
    expect(names('mAiN')).toEqual(['Main St Diner']);
  });

  it('matches part of an address in any case (AC 19.1)', () => {
    expect(names('RIVER rd')).toEqual(['River Market']);
  });

  it('matches by address when the name does not contain the text (AC 19.1)', () => {
    expect(names('west st')).toEqual(['Westport Cafe']);
  });

  it('keeps every store whose name or address matches, in order (AC 19.1)', () => {
    expect(names('st')).toEqual(['Main St Diner', 'Westport Cafe']);
  });

  it('returns no stores when nothing matches (AC 19.2)', () => {
    expect(names('zzz')).toEqual([]);
  });

  it('returns every store for an empty search (AC 19.3)', () => {
    expect(searchStores(stores, '')).toEqual(stores);
  });

  it('treats a search of only spaces as empty (AC 19.3)', () => {
    expect(searchStores(stores, '   ')).toEqual(stores);
  });

  it('ignores spaces around the text', () => {
    expect(names('  cafe ')).toEqual(['Westport Cafe']);
  });

  it('only searches the stores it is given (AC 19.4)', () => {
    const ownStores = stores.slice(0, 2);
    expect(searchStores(ownStores, 'River')).toEqual([]);
  });
});
