import {getSupabaseAdmin} from '../lib/supabase.js';
import type {ChecklistAnswer, ChecklistEntry} from './types.js';

interface ChecklistItemRow {
  checklist_item_id: number;
  text: string;
  checklist_answer: {answer: ChecklistAnswer; ticket_id: number | null}[];
}

/**
 * Every checklist item in order, each with this inspection's answer or none.
 * The filter limits the embedded answers, not the items.
 */
export async function listChecklist(
  inspectionId: number,
): Promise<ChecklistEntry[]> {
  const {data, error} = await getSupabaseAdmin()
    .from('checklist_item')
    .select('checklist_item_id, text, checklist_answer(answer, ticket_id)')
    .eq('checklist_answer.inspection_id', inspectionId)
    .order('sort_order')
    .overrideTypes<ChecklistItemRow[], {merge: false}>();
  if (error) throw error;
  return data.map((row) => {
    const saved = row.checklist_answer[0];
    return {
      id: row.checklist_item_id,
      text: row.text,
      answer: saved?.answer ?? null,
      ticketId: saved?.ticket_id ?? null,
    };
  });
}

/** Saves an inspection's answer to an item, replacing any earlier one. */
export async function saveAnswer(
  inspectionId: number,
  itemId: number,
  answer: ChecklistAnswer,
  ticketId: number | null,
): Promise<void> {
  const {error} = await getSupabaseAdmin().from('checklist_answer').upsert(
    {
      inspection_id: inspectionId,
      checklist_item_id: itemId,
      answer,
      ticket_id: ticketId,
    },
    {onConflict: 'inspection_id,checklist_item_id'},
  );
  if (error) throw error;
}
