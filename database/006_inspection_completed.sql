-- database/006_inspection_completed.sql
-- Completing an inspection (story 16): completed_at stays null while the
-- inspection is in progress and is set once, when it is completed. Run once
-- in the Supabase SQL editor, after 004_checklist.sql.

alter table inspection add column completed_at timestamptz;
