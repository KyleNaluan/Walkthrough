import {describe, expect, it, vi} from 'vitest';
import {listChecklist, saveAnswer} from '../src/db/checklist.js';
import {getSupabaseAdmin} from '../src/lib/supabase.js';

/**
 * A fake Supabase client for listChecklist and saveAnswer. `rows` is what
 * the listChecklist query returns; `calls` records every call made.
 */
function fakeClient(rows: unknown[] = []) {
  const calls: [string, ...unknown[]][] = [];
  const query: Record<string, unknown> = {};
  for (const name of ['from', 'select', 'eq', 'order']) {
    query[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return query;
    };
  }
  query.overrideTypes = async () => ({data: rows, error: null});
  query.upsert = async (...args: unknown[]) => {
    calls.push(['upsert', ...args]);
    return {error: null};
  };
  vi.mocked(getSupabaseAdmin).mockReturnValueOnce(
    query as unknown as ReturnType<typeof getSupabaseAdmin>,
  );
  return calls;
}

describe('listChecklist (story 15)', () => {
  it("listChecklist returns every item with this inspection's answer or null (AC 15.1)", async () => {
    const calls = fakeClient([
      {
        checklist_item_id: 1,
        text: 'Hand-washing sinks are stocked and free to use',
        checklist_answer: [{answer: 'fail', ticket_id: 12}],
      },
      {
        checklist_item_id: 2,
        text: 'Cold food is held at 41 °F or below',
        checklist_answer: [],
      },
    ]);
    expect(await listChecklist(7)).toEqual([
      {
        id: 1,
        text: 'Hand-washing sinks are stocked and free to use',
        answer: 'fail',
        ticketId: 12,
      },
      {
        id: 2,
        text: 'Cold food is held at 41 °F or below',
        answer: null,
        ticketId: null,
      },
    ]);
    expect(calls).toEqual([
      ['from', 'checklist_item'],
      [
        'select',
        'checklist_item_id, text, checklist_answer(answer, ticket_id)',
      ],
      ['eq', 'checklist_answer.inspection_id', 7],
      ['order', 'sort_order'],
    ]);
  });
});

describe('saveAnswer (story 15)', () => {
  it('saveAnswer upserts on the inspection and item (AC 15.1)', async () => {
    const calls = fakeClient();
    await saveAnswer(7, 1, 'fail', 12);
    expect(calls).toEqual([
      ['from', 'checklist_answer'],
      [
        'upsert',
        {inspection_id: 7, checklist_item_id: 1, answer: 'fail', ticket_id: 12},
        {onConflict: 'inspection_id,checklist_item_id'},
      ],
    ]);
  });

  it('saveAnswer on an answered item updates it (AC 15.3)', async () => {
    const first = fakeClient();
    await saveAnswer(7, 1, 'fail', 12);
    const second = fakeClient();
    await saveAnswer(7, 1, 'pass', null);
    expect(second[1]).toEqual([
      'upsert',
      {inspection_id: 7, checklist_item_id: 1, answer: 'pass', ticket_id: null},
      {onConflict: 'inspection_id,checklist_item_id'},
    ]);
    expect(second[1][2]).toEqual(first[1][2]);
  });
});
