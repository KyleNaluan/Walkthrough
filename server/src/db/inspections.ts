import {getSupabaseAdmin} from '../lib/supabase.js';
import type {Inspection, InspectionRow, InspectionSummary} from './types.js';

const inspectionColumns = 'inspection_id, started_at, store_id, inspector_id';

function toInspection(row: InspectionRow): Inspection {
  return {
    id: row.inspection_id,
    startedAt: row.started_at,
    storeId: row.store_id,
    inspectorId: row.inspector_id,
  };
}

/** Saves a new inspection; the database sets the start time. */
export async function createInspection(
  storeId: number,
  inspectorId: string,
): Promise<Inspection> {
  const {data, error} = await getSupabaseAdmin()
    .from('inspection')
    .insert({store_id: storeId, inspector_id: inspectorId})
    .select(inspectionColumns)
    .single<InspectionRow>();
  if (error) throw error;
  return toInspection(data);
}

/** One inspection, or null if it doesn't exist. */
export async function getInspection(id: number): Promise<Inspection | null> {
  const {data, error} = await getSupabaseAdmin()
    .from('inspection')
    .select(inspectionColumns)
    .eq('inspection_id', id)
    .maybeSingle<InspectionRow>();
  if (error) throw error;
  return data && toInspection(data);
}

interface InspectionSummaryRow {
  inspection_id: number;
  started_at: string;
  inspector: {first_name: string; last_name: string};
  ticket: {count: number}[];
}

/** A store's inspections, newest first, each with its number of findings. */
export async function listInspectionsForStore(
  storeId: number,
): Promise<InspectionSummary[]> {
  const {data, error} = await getSupabaseAdmin()
    .from('inspection')
    .select(
      'inspection_id, started_at, inspector:app_user(first_name, last_name), ticket(count)',
    )
    .eq('store_id', storeId)
    .order('started_at', {ascending: false})
    .order('inspection_id', {ascending: false})
    .overrideTypes<InspectionSummaryRow[], {merge: false}>();
  if (error) throw error;
  return data.map((row) => ({
    id: row.inspection_id,
    startedAt: row.started_at,
    inspector: {
      firstName: row.inspector.first_name,
      lastName: row.inspector.last_name,
    },
    findingCount: row.ticket[0].count,
  }));
}
