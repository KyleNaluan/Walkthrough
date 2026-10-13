-- database/002_status_functions.sql
-- Ticket status changes, one function per step, so the status and the rows
-- it depends on are written in one transaction (Supabase Setup, "Ticket
-- status"). Run once in the Supabase SQL editor, after 001_schema.sql.
--
-- The functions check the ticket's status, not who is calling. The server
-- checks the caller's role and store access before it calls them, and passes
-- the reviewer's ID from the logged-in user. A refused step raises P0001 with
-- a message the server shows as is (a 409).
--
-- The re-inspection outcome (passed or failed) comes in a later script.

-- Fix submitted: open or changes_requested -> pending_review -------------

create function submit_fix(
  p_ticket_id bigint,
  p_description text,
  p_photo text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status ticket_status;
  v_fix_id bigint;
begin
  -- Lock the ticket so two requests cannot change its status at once.
  select status into v_status
    from ticket
    where ticket_id = p_ticket_id
    for update;
  if not found then
    raise exception 'Ticket not found' using errcode = 'P0001';
  end if;
  if v_status not in ('open', 'changes_requested') then
    raise exception 'This ticket is not waiting for a fix'
      using errcode = 'P0001';
  end if;

  insert into fix_submission (description, photo, ticket_id)
    values (p_description, p_photo, p_ticket_id)
    returning fix_submission_id into v_fix_id;

  update ticket set status = 'pending_review' where ticket_id = p_ticket_id;

  return v_fix_id;
end;
$$;

-- Fix reviewed: pending_review -> resolved, changes_requested or
-- reinspection_scheduled ----------------------------------------------------

create function review_fix(
  p_fix_id bigint,
  p_reviewer_id uuid,
  p_decision review_decision,
  p_comment text,
  p_scheduled_for date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id bigint;
  v_status ticket_status;
  v_reviewed_at timestamptz;
  v_comment text := nullif(btrim(p_comment), '');
begin
  select ticket_id into v_ticket_id
    from fix_submission
    where fix_submission_id = p_fix_id;
  if not found then
    raise exception 'Fix submission not found' using errcode = 'P0001';
  end if;

  -- Lock the ticket first, in the same order as submit_fix.
  select status into v_status
    from ticket
    where ticket_id = v_ticket_id
    for update;
  if v_status <> 'pending_review' then
    raise exception 'This ticket has no fix waiting for review'
      using errcode = 'P0001';
  end if;

  select reviewed_at into v_reviewed_at
    from fix_submission
    where fix_submission_id = p_fix_id
    for update;
  if v_reviewed_at is not null then
    raise exception 'This fix has already been reviewed'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1 from fix_submission
      where ticket_id = v_ticket_id and fix_submission_id > p_fix_id
  ) then
    raise exception 'Only the latest fix can be reviewed'
      using errcode = 'P0001';
  end if;

  if p_decision = 'changes_requested' and v_comment is null then
    raise exception 'A comment is required to request changes'
      using errcode = 'P0001';
  end if;
  if p_decision = 'reinspection_scheduled' and p_scheduled_for is null then
    raise exception 'A re-inspection date is required'
      using errcode = 'P0001';
  end if;

  update fix_submission
    set reviewer_id = p_reviewer_id,
        review_decision = p_decision,
        review_comment = v_comment,
        reviewed_at = now()
    where fix_submission_id = p_fix_id;

  update ticket
    set status = case p_decision
      when 'approved' then 'resolved'::ticket_status
      when 'changes_requested' then 'changes_requested'::ticket_status
      else 'reinspection_scheduled'::ticket_status
    end
    where ticket_id = v_ticket_id;

  if p_decision = 'reinspection_scheduled' then
    insert into reinspection (scheduled_for, ticket_id, inspector_id)
      values (p_scheduled_for, v_ticket_id, p_reviewer_id);
  end if;
end;
$$;

-- Access ----------------------------------------------------------------
-- Supabase lets anon and authenticated call new functions by default.
-- Only the server, with the secret key, may change a ticket's status.

revoke execute on function
  submit_fix(bigint, text, text),
  review_fix(bigint, uuid, review_decision, text, date)
  from public, anon, authenticated;

grant execute on function
  submit_fix(bigint, text, text),
  review_fix(bigint, uuid, review_decision, text, date)
  to service_role;
