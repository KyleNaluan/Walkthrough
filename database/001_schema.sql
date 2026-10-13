-- database/001_schema.sql
-- Copied unchanged from the team Drive (Database/Supabase Schema.sql).
-- It already ran on the shared Supabase project on 2026-10-12, so do not run
-- it there again. Later changes go in new numbered scripts (002, 003, ...).

-- Walkthrough - Supabase schema
-- Translated from the Logical Design (revised 2026-10-12).
-- Run once in the Supabase SQL editor on an empty project.

-- Value lists -----------------------------------------------------------

create type user_role as enum ('inspector', 'store_owner');
create type severity as enum ('low', 'medium', 'high');
create type ticket_status as enum (
  'open',
  'pending_review',
  'changes_requested',
  'reinspection_scheduled',
  'resolved'
);
create type review_decision as enum (
  'approved',
  'changes_requested',
  'reinspection_scheduled'
);
create type reinspection_outcome as enum ('pending', 'passed', 'failed');

-- User ------------------------------------------------------------------
-- "user" is a reserved word in PostgreSQL, so the relation is app_user.
-- user_id is the id of the matching Supabase Auth account, which holds
-- the password and the login session.

create table app_user (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  role user_role not null
);

-- Store -----------------------------------------------------------------

create table store (
  store_id bigint generated always as identity primary key,
  name text not null,
  address text not null,
  owner_id uuid not null references app_user (user_id),
  unique (name, address)
);

-- Inspection ------------------------------------------------------------

create table inspection (
  inspection_id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  store_id bigint not null references store (store_id),
  inspector_id uuid not null references app_user (user_id)
);

-- Ticket ----------------------------------------------------------------
-- photo holds the path of the file in Supabase Storage.

create table ticket (
  ticket_id bigint generated always as identity primary key,
  description text not null,
  severity severity not null,
  deadline date not null,
  photo text not null,
  recorded_at timestamptz not null default now(),
  status ticket_status not null default 'open',
  inspection_id bigint not null references inspection (inspection_id)
);

-- FixSubmission ---------------------------------------------------------
-- The four review columns stay empty until an inspector reviews the fix.

create table fix_submission (
  fix_submission_id bigint generated always as identity primary key,
  description text not null,
  photo text not null,
  submitted_at timestamptz not null default now(),
  ticket_id bigint not null references ticket (ticket_id),
  reviewer_id uuid references app_user (user_id),
  review_decision review_decision,
  review_comment text,
  reviewed_at timestamptz,
  -- A review has a reviewer, a decision and a time, or none of the three.
  constraint review_is_complete
    check (num_nonnulls(reviewer_id, review_decision, reviewed_at) in (0, 3)),
  -- A comment only exists as part of a review.
  constraint comment_needs_review
    check (review_comment is null or review_decision is not null),
  -- Requesting changes needs a comment saying what to change.
  constraint changes_need_comment
    check (review_decision <> 'changes_requested' or review_comment is not null)
);

-- Reinspection ----------------------------------------------------------
-- inspector_id is the inspector who scheduled it.
-- inspection_id stays empty until the follow-up visit is carried out.

create table reinspection (
  reinspection_id bigint generated always as identity primary key,
  scheduled_for date not null,
  created_at timestamptz not null default now(),
  outcome reinspection_outcome not null default 'pending',
  ticket_id bigint not null references ticket (ticket_id),
  inspector_id uuid not null references app_user (user_id),
  inspection_id bigint references inspection (inspection_id),
  -- Passed or failed can only be recorded once the visit exists.
  constraint outcome_needs_visit
    check (outcome = 'pending' or inspection_id is not null)
);

-- Indexes on the foreign keys -------------------------------------------
-- PostgreSQL indexes primary and alternate keys itself, not foreign keys.
-- These cover the lookups the app makes: an owner's stores, a store's
-- inspections, an inspection's tickets, a ticket's fixes and re-inspections.

create index store_owner_id_idx on store (owner_id);
create index inspection_store_id_idx on inspection (store_id);
create index inspection_inspector_id_idx on inspection (inspector_id);
create index ticket_inspection_id_idx on ticket (inspection_id);
create index fix_submission_ticket_id_idx on fix_submission (ticket_id);
create index fix_submission_reviewer_id_idx on fix_submission (reviewer_id);
create index reinspection_ticket_id_idx on reinspection (ticket_id);
create index reinspection_inspector_id_idx on reinspection (inspector_id);
create index reinspection_inspection_id_idx on reinspection (inspection_id);

-- Access ----------------------------------------------------------------
-- Row-level security is on with no policies, so the publishable key reads
-- and writes nothing. Only the Express server, which uses the secret key,
-- reaches these tables, and it checks role and store access itself.

alter table app_user enable row level security;
alter table store enable row level security;
alter table inspection enable row level security;
alter table ticket enable row level security;
alter table fix_submission enable row level security;
alter table reinspection enable row level security;

grant select, insert, update, delete
  on app_user, store, inspection, ticket, fix_submission, reinspection
  to service_role;
