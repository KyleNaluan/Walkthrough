import {getSupabaseAdmin} from '../lib/supabase.js';
import type {Inspection, InspectionRow} from './types.js';

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
