-- database/004_checklist.sql
-- The inspection checklist (story 15): the standard items every inspection
-- answers, and one answer per inspection and item. Run once in the Supabase
-- SQL editor, after 003_reinspection_result.sql.

-- Value lists -----------------------------------------------------------

create type checklist_result as enum ('pass', 'fail', 'na');

-- ChecklistItem ---------------------------------------------------------
-- The standard form. sort_order is the order the items are shown in.

create table checklist_item (
  checklist_item_id bigint generated always as identity primary key,
  sort_order int not null unique,
  text text not null
);

-- ChecklistAnswer -------------------------------------------------------
-- One answer per inspection and item, so a new answer replaces the old one.
-- ticket_id is the finding a failed item is for.

create table checklist_answer (
  inspection_id bigint not null references inspection (inspection_id),
  checklist_item_id bigint not null
    references checklist_item (checklist_item_id),
  answer checklist_result not null,
  ticket_id bigint references ticket (ticket_id),
  primary key (inspection_id, checklist_item_id),
  -- A failed item has a finding, and only a failed item has one.
  constraint fail_needs_finding
    check ((answer = 'fail') = (ticket_id is not null))
);

create index checklist_answer_ticket_id_idx on checklist_answer (ticket_id);

-- Standard items --------------------------------------------------------

insert into checklist_item (sort_order, text) values
  (1, 'Hand-washing sinks are stocked and free to use'),
  (2, 'Cold food is held at 41 °F or below'),
  (3, 'Hot food is held at 135 °F or above'),
  (4, 'Raw meat is stored below ready-to-eat food'),
  (5, 'Food-contact surfaces are clean and sanitized'),
  (6, 'There are no signs of pests'),
  (7, 'Food is from approved sources and date-labelled'),
  (8, 'Staff wear hair restraints and clean clothing'),
  (9, 'Chemicals are stored away from food'),
  (10, 'Waste bins are covered and emptied');

-- Access ----------------------------------------------------------------
-- As in 001, only the Express server, with the secret key, reaches these
-- tables. It reads the items and never changes them.

alter table checklist_item enable row level security;
alter table checklist_answer enable row level security;

grant select on checklist_item to service_role;
grant select, insert, update, delete on checklist_answer to service_role;
